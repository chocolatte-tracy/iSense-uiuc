import { normalizeEndpoint, parseRoutesResponse, RoutingError } from '../src/routing.js';
import { classifiedGoogleError } from './google-error.js';

export const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const FIELD_MASK = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.routeLabels';
function waypoint(value) {
  const endpoint = normalizeEndpoint(value);
  return typeof endpoint === 'string' ? { address: endpoint } : {
    location: { latLng: { latitude: endpoint.lat, longitude: endpoint.lng } },
  };
}

/** Server only. Inject fetchImpl in tests; never retry automatically. */
export async function computeWalkingRoutes({ origin, destination }, {
  apiKey = process.env.GOOGLE_ROUTES_API_KEY, fetchImpl = globalThis.fetch, timeoutMs = 12000,
} = {}) {
  const body = {
    origin: waypoint(origin), destination: waypoint(destination), travelMode: 'WALK',
    computeAlternativeRoutes: true, polylineQuality: 'HIGH_QUALITY', polylineEncoding: 'ENCODED_POLYLINE',
  };
  if (!apiKey?.trim()) throw new RoutingError('MISSING_API_KEY', 'Set GOOGLE_ROUTES_API_KEY in server secrets and restart the server.', 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ROUTES_URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      const classified = classifiedGoogleError(response.status, failure);
      if (classified) throw classified;
      const errors = {
        400: ['GOOGLE_REJECTED_REQUEST', 'Google rejected the route inputs. Check the origin and destination.', 400],
        401: ['GOOGLE_AUTH_ERROR', 'Google authentication failed. Check the server key configuration.', 502],
        403: ['GOOGLE_PERMISSION_ERROR', 'Google denied access. Check Routes API enablement, billing, and server-key restrictions.', 502],
        429: ['GOOGLE_RATE_LIMIT', 'Google quota or rate limit reached. Wait before trying again manually.', 429],
      };
      throw new RoutingError(...(errors[response.status] ?? ['GOOGLE_UNAVAILABLE', 'Google Routes is unavailable. Try again manually later.', 502]));
    }
    let rawResponse;
    try { rawResponse = await response.json(); }
    catch { throw new RoutingError('INVALID_RESPONSE', 'Google returned unreadable JSON.', 502); }
    const parsed = parseRoutesResponse(rawResponse);
    return { source: 'google-routes-live', ...parsed, rawResponse };
  } catch (error) {
    if (controller.signal.aborted) throw new RoutingError('UPSTREAM_TIMEOUT', 'Google Routes timed out. Try again manually.', 504);
    if (error instanceof RoutingError) throw error;
    // Do not forward upstream exceptions: they can include request headers or URLs.
    throw new RoutingError('UPSTREAM_NETWORK_ERROR', 'Could not reach Google Routes. Check server network access.', 502);
  } finally { clearTimeout(timer); }
}
