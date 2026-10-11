import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptWalkingRoutes, formatRouteDistance, formatRouteTime } from './live-routes';
import { buildGoogleMapsURL } from './google-maps-url';
import { rankRoutes, outsideSensoryRoutes, initialPreferences } from './route-scoring';

// SYNTHETIC OFFLINE FIXTURE. These paths are not verified campus geometry.
const endpoints = { origin: 'Main Quad, UIUC', destination: 'Grainger Engineering Library, UIUC' };
const trip = { originId: 'main-quad', destinationId: 'grainger-library', originName: 'Main Quad', destinationName: 'Grainger Engineering Library' };
export const offlineWalkingResult = {
  source: 'google-routes-live' as const, routeCount: 3, alternativesReturned: true,
  routes: [525, 532, 617].map((seconds, index) => ({
    id: `route-${index}`, durationSeconds: seconds, durationMinutes: seconds / 60,
    distanceMeters: [634, 639, 745][index], encodedPolyline: 'synthetic-offline-fixture',
    labels: [index ? 'DEFAULT_ROUTE_ALTERNATE' : 'DEFAULT_ROUTE'],
    path: [
      { lat: 40.10752, lng: -88.22723 }, { lat: 40.109, lng: -88.229 + index * .002 },
      { lat: 40.111, lng: -88.229 + index * .002 }, { lat: 40.1125, lng: -88.22692 },
    ],
  })),
};

test('teammate results bridge into scorer with exact travel values and request endpoints', () => {
  const routes = adaptWalkingRoutes(offlineWalkingResult, endpoints, trip);
  assert.deepEqual(routes.map(formatRouteTime), ['8 min 45 sec', '8 min 52 sec', '10 min 17 sec']);
  assert.deepEqual(routes.map(formatRouteDistance), ['634 m', '639 m', '745 m']);
  assert.equal(routes[0].walkingTimeMinutes, 8.75);
  for (const route of routes) {
    const url = new URL(buildGoogleMapsURL(route));
    assert.equal(url.searchParams.get('origin'), endpoints.origin);
    assert.equal(url.searchParams.get('destination'), endpoints.destination);
    assert.equal(url.searchParams.get('travelmode'), 'walking');
    assert.equal(url.searchParams.get('waypoints'), route.candidateWaypoints.map(p => `${p.latitude},${p.longitude}`).join('|'));
    assert.ok(route.coordinates.length > 1);
  }
});

test('zero/one routes are honest; single route has no invented waypoint', () => {
  assert.deepEqual(adaptWalkingRoutes({ ...offlineWalkingResult, routeCount: 0, routes: [] }, endpoints, trip), []);
  const [route] = adaptWalkingRoutes({ ...offlineWalkingResult, routeCount: 1, routes: offlineWalkingResult.routes.slice(0, 1) }, endpoints, trip);
  assert.deepEqual(route.candidateWaypoints, []);
  assert.equal(new URL(buildGoogleMapsURL(route)).searchParams.has('waypoints'), false);
});

test('sensory exclusions remain inspectable, while the maximum walking-time limit stays hard', () => {
  const routes = adaptWalkingRoutes(offlineWalkingResult, endpoints, trip);
  assert.deepEqual(outsideSensoryRoutes(routes, rankRoutes(routes, initialPreferences), 5), []);
  const zeroExtra = { ...initialPreferences, maxExtraWalkingMinutes: 0 };
  assert.deepEqual(outsideSensoryRoutes(routes, rankRoutes(routes, zeroExtra), 0), []);
  const highSun = { ...initialPreferences, sunAcceptance: 'high' as const };
  assert.deepEqual(outsideSensoryRoutes(routes, rankRoutes(routes, highSun), 5), []);
});

test('real second-level time differences are scored locally without rounding away the time constraint', () => {
  const routes = adaptWalkingRoutes(offlineWalkingResult, endpoints, trip);
  assert.equal(rankRoutes(routes, { ...initialPreferences, maxExtraWalkingMinutes: 0 }).length, 1);
  const shortest = rankRoutes(routes, { ...initialPreferences, avoidNoise: 0, avoidCrowds: 0, preferShade: 0,
    prioritizeShortWalkingTime: 100, noiseAcceptance: 'high', crowdAcceptance: 'high', sunAcceptance: 'high' });
  assert.equal(shortest[0].id, 'route-0');
  const noisePriority = rankRoutes(routes, { ...initialPreferences, avoidNoise: 100, avoidCrowds: 0, preferShade: 0,
    prioritizeShortWalkingTime: 0, noiseAcceptance: 'high', crowdAcceptance: 'high', sunAcceptance: 'high' });
  // Unmapped paths use identical demo costs, not response-order profiles.
  assert.equal(noisePriority[0].id, shortest[0].id);
  assert.ok(routes.every(route => route.noiseCost === 50 && route.crowdCost === 50 && route.sunExposureCost === 50));
});
