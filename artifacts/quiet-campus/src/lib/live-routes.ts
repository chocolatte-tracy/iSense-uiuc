import { fetchWalkingRoutes, getGoogleMapsConfig, type WalkingRouteInput, type WalkingRouteResult } from '@workspace/api-client-react';
import { selectWaypoints } from '@workspace/campus-routing/waypoints';
import { demoRoutes } from './demo-routes';
import type { DemoRoute } from './route-scoring';
import { applyCampusObservations, emptyObservations, LIVE_DEMO_COST, type ObservationDataset } from './campus-observations';

export type TripIdentity = Pick<DemoRoute, 'originId' | 'destinationId' | 'originName' | 'destinationName'>;
const endpointText = (endpoint: WalkingRouteInput['origin']) =>
  typeof endpoint === 'string' ? endpoint : `${endpoint.lat},${endpoint.lng}`;

// Sensory evidence is tied to geometry, never Google's response-local IDs/order.
export function adaptWalkingRoutes(data: WalkingRouteResult, input: WalkingRouteInput, trip: TripIdentity, observations: ObservationDataset = emptyObservations): DemoRoute[] {
  return data.routes.map((route, index) => applyCampusObservations({
    ...trip,
    id: route.id,
    routeCode: String(index + 1),
    name: `Google walking route ${index + 1}`,
    walkingTimeMinutes: route.durationSeconds / 60,
    distanceMiles: route.distanceMeters / 1609.344,
    durationSeconds: route.durationSeconds,
    distanceMeters: route.distanceMeters,
    noiseCost: LIVE_DEMO_COST,
    crowdCost: LIVE_DEMO_COST,
    sunExposureCost: LIVE_DEMO_COST,
    coordinates: route.path.map(({ lat, lng }) => [lat, lng] as [number, number]),
    candidateWaypoints: selectWaypoints(route.path, data.routes.filter(other => other.id !== route.id).map(other => other.path))
      .map(({ lat, lng }) => ({ latitude: lat, longitude: lng })),
    researchSourceUrl: '',
    navigationOrigin: endpointText(input.origin),
    navigationDestination: endpointText(input.destination),
    labels: route.labels,
    source: 'google',
  }, observations));
}

// Configuration only: startup and preference changes never request walking routes.
export async function loadCampusRoutes(signal: AbortSignal) {
  const config = await getGoogleMapsConfig({ signal, cache: 'no-store' });
  return {
    routes: demoRoutes,
    message: config.routingMessage ?? 'Public live routing is not enabled. Main Quad → Grainger research demo is available.',
    routesEnabled: config.routesEnabled === true && config.publicRoutesEnabled === true,
    browserApiKey: config.enabled ? config.browserApiKey : undefined,
    mapMessage: config.message,
    places: {
      enabled: config.placesEnabled === true && Boolean(config.browserApiKey),
      apiKey: config.placesEnabled ? config.browserApiKey : undefined,
      message: config.placesMessage ?? 'PLACES_DISABLED: Google address search is not enabled. Campus choices remain available.',
    },
  };
}

export async function requestWalkingRoutes(input: WalkingRouteInput, trip: TripIdentity, signal: AbortSignal) {
  // Generated POST client: same-origin /api/walking-routes, one request, no retries.
  const data = await fetchWalkingRoutes(input, { signal });
  return {
    routes: adaptWalkingRoutes(data, input, trip),
    message: data.routes.length
      ? `${data.routeCount} Google walking route${data.routeCount === 1 ? '' : 's'} loaded. Real travel estimates and geometry; sensory values use mapped team observations when supplied. Unmapped portions remain DEMO DATA (50/100 placeholder, not a measurement).`
      : 'Google returned no walking routes for these places. No alternatives have been invented.',
  };
}

export function formatRouteTime(route: DemoRoute) {
  if (route.durationSeconds === undefined) return `${route.walkingTimeMinutes} min`;
  const seconds = Math.round(route.durationSeconds);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
}

export function formatRouteDistance(route: DemoRoute) {
  return route.distanceMeters === undefined ? `${route.distanceMiles.toFixed(1)} mi` : `${route.distanceMeters} m`;
}
