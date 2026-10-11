import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCampusObservations, emptyObservations, parseObservationDataset, sensorySummary, type ObservationDataset } from './campus-observations';
import { adaptWalkingRoutes } from './live-routes';
import { demoRoutes } from './demo-routes';
import { initialPreferences, rankRoutes, rebalanceWeights } from './route-scoring';

// SYNTHETIC TEST-ONLY geometry and observation values. Not campus evidence.
const path: [number, number][] = [[0, 0], [0, .001], [0, .002]];
const input = { origin: 'test origin', destination: 'test destination' };
const trip = { originId: 'test-o', destinationId: 'test-d', originName: 'test origin', destinationName: 'test destination' };
const result = {
  source: 'google-routes-live' as const, routeCount: 2, alternativesReturned: true,
  routes: [
    { id: 'response-0', durationSeconds: 600, durationMinutes: 10, distanceMeters: 222, encodedPolyline: 'TEST', labels: [], path: path.map(([lat, lng]) => ({ lat, lng })) },
    { id: 'response-1', durationSeconds: 660, durationMinutes: 11, distanceMeters: 240, encodedPolyline: 'TEST', labels: [], path: [{ lat: 0, lng: 0 }, { lat: .001, lng: .001 }, { lat: 0, lng: .002 }] },
  ],
};
const estimate = { value: 10, status: 'estimate' as const, method: 'synthetic unit fixture' };
const verified = { ...estimate, status: 'verified' as const, reviewedBy: 'TEST reviewer', reviewedAt: '2025-01-02T12:00:00Z' };
function dataset(full = true): ObservationDataset {
  return parseObservationDataset({
    version: 1,
    segments: [{ id: 'stable-test-segment', name: 'TEST only', direction: 'forward', path: full ? path : path.slice(0, 2) }],
    observations: [{ id: 'test-observation', segmentId: 'stable-test-segment', observedAt: '2025-01-01T12:00:00Z', source: 'SYNTHETIC TEST', conditions: 'TEST only', noise: verified, crowds: verified, sunlight: verified }],
  });
}

test('empty data never manufactures evidence; fallback candidate geometry remains unverified', () => {
  const routes = adaptWalkingRoutes(result, input, trip);
  assert.ok(routes.every(route => sensorySummary(route).includes('DEMO DATA')));
  assert.ok(routes.every(route => route.noiseCost === 50));
  assert.equal(applyCampusObservations(demoRoutes[0], dataset()), demoRoutes[0]);
});

test('geometry, not response order or IDs, selects observations and keeps Google travel values', () => {
  const routes = adaptWalkingRoutes(result, input, trip, dataset());
  const reordered = adaptWalkingRoutes({ ...result, routes: [...result.routes].reverse().map((r, i) => ({ ...r, id: `new-${i}` })) }, input, trip, dataset());
  assert.equal(routes[0].noiseCost, 10);
  assert.equal(routes[1].noiseCost, 50);
  assert.equal(reordered[1].noiseCost, 10);
  assert.deepEqual(reordered[1].sensoryEvidence, routes[0].sensoryEvidence);
  assert.equal(routes[0].durationSeconds, 600);
  assert.equal(routes[0].distanceMeters, 222);
  assert.match(sensorySummary(routes[0]), /Verified observations/);
  assert.equal(routes[0].sensoryEvidence?.observations[0].source, 'SYNTHETIC TEST');
});

test('partial segment coverage weights demo remainder by distance and never claims full verification', () => {
  const [route] = adaptWalkingRoutes(result, input, trip, dataset(false));
  assert.ok(Math.abs(route.noiseCost - 30) < 1e-9);
  assert.equal(route.sensoryEvidence?.metrics.noise.status, 'mixed');
  assert.equal(route.sensoryEvidence?.metrics.noise.verifiedPercent, 50);
  assert.equal(route.sensoryEvidence?.metrics.noise.demoPercent, 50);
  assert.match(sensorySummary(route), /Mixed/);
});

test('omitted metrics stay demo; full estimates never become verified', () => {
  const data = dataset();
  data.observations[0] = { ...data.observations[0], noise: estimate, crowds: undefined, sunlight: undefined };
  const [route] = adaptWalkingRoutes(result, input, trip, data);
  assert.equal(route.noiseCost, 10);
  assert.equal(route.crowdCost, 50);
  assert.equal(route.sensoryEvidence?.metrics.noise.status, 'estimate');
  assert.equal(route.sensoryEvidence?.metrics.crowds.status, 'demo');
});

test('nearby, differently sampled, or noncontiguous paths cannot inherit observed scores', () => {
  for (const changed of [
    [[0, 0], [.00001, .001], [0, .002]],
    [[0, 0], [0, .0005], [0, .001], [0, .002]],
    [[0, 0], [1, 1], [0, .001], [0, .002]],
  ] as [number, number][][]) {
    const [route] = adaptWalkingRoutes(result, input, trip);
    assert.equal(applyCampusObservations({ ...route, coordinates: changed }, dataset()).noiseCost, 50);
  }
});

test('reverse evidence needs explicit both-direction permission', () => {
  const [route] = adaptWalkingRoutes(result, input, trip);
  const reversed = { ...route, coordinates: [...route.coordinates].reverse() };
  const data = dataset();
  assert.equal(applyCampusObservations(reversed, data).noiseCost, 50);
  data.segments[0].direction = 'both';
  assert.equal(applyCampusObservations(reversed, data).noiseCost, 10);
});

test('latest metric observation wins deterministically and overlapping segments do not double count', () => {
  const data = dataset();
  data.observations.push({ ...data.observations[0], id: 'newer', observedAt: '2025-02-01T12:00:00Z', noise: { ...estimate, value: 90 }, crowds: undefined, sunlight: undefined });
  const [route] = adaptWalkingRoutes(result, input, trip, data);
  assert.equal(route.noiseCost, 90);
  assert.equal(route.crowdCost, 10);
  assert.equal(route.sensoryEvidence?.metrics.noise.status, 'estimate');
  data.observations.push({ ...data.observations[1], id: 'a-tie', noise: { ...estimate, value: 80 } });
  const [tie] = adaptWalkingRoutes(result, input, trip, { ...data, observations: [...data.observations].reverse() });
  assert.equal(tie.noiseCost, 80);
  assert.equal(tie.sensoryEvidence?.metrics.noise.estimatedPercent, 100);
});

test('invalid data is rejected: provenance, review, dates, range, references, coordinates and duplicate IDs', () => {
  const invalid = [
    (d: ObservationDataset) => { d.observations[0].source = ''; },
    (d: ObservationDataset) => { d.observations[0].conditions = ''; },
    (d: ObservationDataset) => { delete d.observations[0].noise!.reviewedBy; },
    (d: ObservationDataset) => { d.observations[0].observedAt = '2999-01-01T00:00:00Z'; },
    (d: ObservationDataset) => { d.observations[0].observedAt = '2025-01-01'; },
    (d: ObservationDataset) => { d.observations[0].noise!.reviewedAt = '2024-01-01T00:00:00Z'; },
    (d: ObservationDataset) => { d.observations[0].noise!.value = 101; },
    (d: ObservationDataset) => { d.observations[0].segmentId = 'unknown'; },
    (d: ObservationDataset) => { d.segments[0].path[0][0] = 91; },
    (d: ObservationDataset) => { d.segments.push(d.segments[0]); },
    (d: ObservationDataset) => { d.observations.push(d.observations[0]); },
    (d: ObservationDataset) => { d.segments[0].path[1] = d.segments[0].path[0]; },
    (d: ObservationDataset) => { delete d.observations[0].noise; delete d.observations[0].crowds; delete d.observations[0].sunlight; },
  ];
  for (const modify of invalid) {
    const data = dataset();
    modify(data);
    assert.throws(() => parseObservationDataset(data));
  }
  assert.throws(() => parseObservationDataset({ ...emptyObservations, unknown: true }));
});

test('observations rerank locally, preserving hard minute limits, acceptance and locked weight allocation', () => {
  const data = dataset();
  data.segments[0].path = result.routes[1].path.map(({ lat, lng }) => [lat, lng]);
  const routes = adaptWalkingRoutes(result, input, trip, data);
  const preferences = { ...initialPreferences, noiseAcceptance: 'low' as const, crowdAcceptance: 'low' as const, sunAcceptance: 'low' as const };
  assert.equal(rankRoutes(routes, preferences)[0].id, 'response-1');
  const zeroExtra = rankRoutes(routes, { ...preferences, maxExtraWalkingMinutes: 0 });
  assert.equal(zeroExtra.length, 1);
  assert.equal(zeroExtra[0].id, 'response-0');
  assert.equal(zeroExtra[0].meetsAcceptance, false);
  const locked = rebalanceWeights(preferences, 'preferShade', 60, ['avoidNoise']);
  assert.equal(locked.avoidNoise, 40);
  assert.equal(locked.avoidNoise + locked.avoidCrowds + locked.preferShade + locked.prioritizeShortWalkingTime, 100);
  assert.equal(applyCampusObservations(routes[1], emptyObservations).noiseCost, 50);
});
