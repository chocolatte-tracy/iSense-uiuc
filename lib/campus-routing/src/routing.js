/** Pure browser-safe helpers. This module never reads keys or calls Google. */
export const UIUC_EXAMPLE = Object.freeze({
  origin: 'Main Quad, University of Illinois Urbana-Champaign, Urbana, IL',
  destination: 'Grainger Engineering Library, University of Illinois Urbana-Champaign, Urbana, IL',
});
export const WALKING_WARNING = 'Walking routes are in beta and may be missing clear sidewalks or pedestrian paths.';
export const HANDOFF_WARNING = 'Google Maps may recalculate the path. Waypoints cannot guarantee exact route preservation and may be ignored on some devices.';

export class RoutingError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'RoutingError';
    this.code = code;
    this.status = status;
  }
}

export function validatePoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point) ||
      !Number.isFinite(point.lat) || !Number.isFinite(point.lng) ||
      Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
    throw new RoutingError('INVALID_COORDINATE', 'Coordinates must have numeric lat (-90 to 90) and lng (-180 to 180).');
  }
  return { lat: point.lat, lng: point.lng };
}

export function normalizeEndpoint(value) {
  if (typeof value === 'string') {
    const address = value.trim();
    if (!address || address.length > 300 || /[\x00-\x1f\x7f]/.test(address)) {
      throw new RoutingError('INVALID_ENDPOINT', 'Enter an origin and destination, each at most 300 characters.');
    }
    return address;
  }
  return validatePoint(value);
}

export function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > 200000) {
    throw new RoutingError('INVALID_POLYLINE', 'Route geometry is missing or too large.', 502);
  }
  let index = 0, lat = 0, lng = 0;
  const points = [];
  function read() {
    let value = 0, shift = 0, byte;
    do {
      if (index >= encoded.length || shift > 30) {
        throw new RoutingError('INVALID_POLYLINE', 'Route geometry is malformed.', 502);
      }
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new RoutingError('INVALID_POLYLINE', 'Route geometry is malformed.', 502);
      value += (byte & 31) * 2 ** shift;
      shift += 5;
    } while (byte >= 32);
    return value % 2 ? -(Math.floor(value / 2) + 1) : value / 2;
  }
  while (index < encoded.length) {
    lat += read(); lng += read();
    try { points.push(validatePoint({ lat: lat / 1e5, lng: lng / 1e5 })); }
    catch { throw new RoutingError('INVALID_POLYLINE', 'Route geometry contains invalid coordinates.', 502); }
  }
  if (points.length < 2) throw new RoutingError('INVALID_POLYLINE', 'Route geometry needs at least two points.', 502);
  return points;
}

export function parseRoutesResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.error ||
      (data.routes !== undefined && !Array.isArray(data.routes))) {
    throw new RoutingError('INVALID_RESPONSE', 'Google returned an invalid route response.', 502);
  }
  // Protobuf JSON can omit an empty repeated field; {} means no routes.
  const routes = (data.routes ?? []).map((route, index) => {
    if (!route || typeof route !== 'object' ||
        !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 ||
        typeof route.duration !== 'string' || !/^\d+(?:\.\d{1,9})?s$/.test(route.duration)) {
      throw new RoutingError('INVALID_RESPONSE', 'A route is missing valid distance or duration.', 502);
    }
    const durationSeconds = Number(route.duration.slice(0, -1));
    if (!Number.isFinite(durationSeconds)) throw new RoutingError('INVALID_RESPONSE', 'Invalid duration.', 502);
    const encodedPolyline = route.polyline?.encodedPolyline;
    return {
      id: `route-${index}`, distanceMeters: route.distanceMeters,
      durationSeconds, durationMinutes: durationSeconds / 60,
      encodedPolyline, path: decodePolyline(encodedPolyline),
      labels: Array.isArray(route.routeLabels) ? route.routeLabels.filter(x => typeof x === 'string') : [],
    };
  });
  return { routes, alternativesReturned: routes.length > 1, routeCount: routes.length };
}

function endpointText(endpoint) {
  const p = normalizeEndpoint(endpoint);
  return typeof p === 'string' ? p : `${p.lat},${p.lng}`;
}

export function buildGoogleMapsUrl({ origin, destination, waypoints = [] }) {
  if (!Array.isArray(waypoints) || waypoints.length > 3) {
    throw new RoutingError('INVALID_WAYPOINTS', 'Use zero to three waypoint coordinates.');
  }
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', endpointText(origin));
  url.searchParams.set('destination', endpointText(destination));
  url.searchParams.set('travelmode', 'walking');
  if (waypoints.length) url.searchParams.set('waypoints', waypoints.map(p => endpointText(validatePoint(p))).join('|'));
  if (url.href.length > 2048) throw new RoutingError('URL_TOO_LONG', 'The Google Maps URL exceeds 2,048 characters; use shorter endpoints.');
  return url.href;
}
