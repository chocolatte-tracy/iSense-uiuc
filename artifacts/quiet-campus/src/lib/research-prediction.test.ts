import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { adaptWalkingRoutes } from './live-routes';
import { initialPreferences, rankRoutes } from './route-scoring';
import { calculateSunContext } from './sun-context';
import { exportPredictionRoutes, importPredictionResult, routeSnapshotKey } from './research-prediction';

// Synthetic path passed through the real Google response adapter. No paid API call.
export function syntheticRoute() {
  return adaptWalkingRoutes({ source: 'google-routes-live', routeCount: 1, alternativesReturned: false,
    routes: [{ id: 'reused-provider-id', distanceMeters: 240, durationSeconds: 185.25, durationMinutes: 3.0875,
      encodedPolyline: 'SYNTHETIC-NOT-A-REAL-GOOGLE-ROUTE', labels: [],
      path: [{ lat: 40.108, lng: -88.2272 }, { lat: 40.1088, lng: -88.2274 }, { lat: 40.110, lng: -88.2272 }] }] },
  { origin: 'test origin', destination: 'test destination' },
  { originId: 'test-origin', destinationId: 'test-destination', originName: 'Test origin', destinationName: 'Test destination' })[0];
}

async function exampleResult() {
  const route = syntheticRoute();
  const { binding } = (await exportPredictionRoutes([route], new Date('2026-06-21T10:00:00-05:00'))).routes[0];
  const duration = binding.durationMilliseconds / 60000;
  return { schemaVersion: 'isense-research-results-1', routes: [{
    schemaVersion: '2.3', routeId: route.id, binding, departureAt: binding.departureAt,
    evidenceType: 'modeled_direct_sunlight', metric: 'direct_sunlit_length_fraction', unit: 'fraction', rankingEligible: false,
    status: 'modeled', value: null, coverageFraction: .75, sunlitFractionBounds: [.25, .5],
    modeledSunlitMinutesBounds: [duration * .25, duration * .5], totalRouteLengthMeters: 200, coveredRouteLengthMeters: 150,
    lengthsMeters: { sunlit: 50, shaded: 75, night: 25, unknown: 50 },
    source: { gridSha256: '109eca2ad7406836a932d1d50297488ae60491a69efa4e099c08d6f4fd38b902' },
    model: { id: 'dsm-solar-raytrace', version: '0.1', radiusMeters: 300, receiverHeightMeters: 1.5, routeSpacingMeters: 5, constantWalkingSpeedAssumption: true },
    limitations: ['synthetic fixture'], boundsMeaning: 'missing support only',
  }] };
}

test('full route export flips lat/lon once, preserves fractional seconds and excludes waypoints', async () => {
  const route = syntheticRoute();
  route.candidateWaypoints = [{ latitude: 0, longitude: 0 }];
  route.walkingTimeMinutes = 999; // Must not use this rounded/display fallback.
  const request = await exportPredictionRoutes([route], new Date('2026-06-21T10:00:00-05:00'));
  assert.deepEqual(request.routes[0].geometry.coordinates, [[-88.2272, 40.108], [-88.2274, 40.1088], [-88.2272, 40.110]]);
  assert.equal(request.routes[0].durationSeconds, 185.25);
  assert.equal(request.routes[0].binding.durationMilliseconds, 185250);
  assert.equal(request.departureAt, '2026-06-21T15:00:00.000Z');
});

test('demo, missing seconds, wrong coordinate order, invalid date and oversized exports are rejected', async () => {
  const r = syntheticRoute(), at = new Date();
  for (const route of [{ ...r, source: undefined }, { ...r, durationSeconds: undefined },
    { ...r, coordinates: r.coordinates.map(([lat, lon]) => [lon, lat] as [number, number]) },
    { ...r, durationSeconds: Infinity }, { ...r, coordinates: [r.coordinates[0]] }])
    await assert.rejects(exportPredictionRoutes([route], at));
  await assert.rejects(exportPredictionRoutes([r], new Date('invalid')));
  await assert.rejects(exportPredictionRoutes(Array(9).fill(r), at));
});

test('same route shape/duration can match a new provider ID; changing either cannot reuse results', async () => {
  const r = syntheticRoute(), data = await exampleResult();
  await importPredictionResult(data, { ...r, id: 'a-new-response-id' });
  await assert.rejects(importPredictionResult(data, { ...r, durationSeconds: r.durationSeconds! + 1 }));
  await assert.rejects(importPredictionResult(data, { ...r, coordinates: [...r.coordinates, [40.111, -88.2272]] }));
  assert.notEqual(routeSnapshotKey(r), routeSnapshotKey({ ...r, durationSeconds: 100 }));
  assert.notEqual(routeSnapshotKey(r), routeSnapshotKey({ ...r, coordinates: r.coordinates.slice(1) }));
});

test('empty IDs and duplicate snapshots fail at export instead of the offline runner', async () => {
  const route = syntheticRoute(), at = new Date('2026-06-21T15:00:00Z');
  await assert.rejects(exportPredictionRoutes([{ ...route, id: ' ' }], at), /route ID/);
  await assert.rejects(exportPredictionRoutes([route, { ...route, id: 'other-provider-id' }], at), /Duplicate route snapshots/);
});

test('binding and provenance/unit failures cannot enter the research display', async () => {
  const data = await exampleResult();
  const mutations: Array<(r: any) => void> = [
    r => { r.binding.departureAt = '2026-06-22T15:00:00.000Z'; },
    r => { r.departureAt = '2026-06-22T15:00:00.000Z'; },
    r => { r.binding.geometrySha256 = '0'.repeat(64); },
    r => { r.binding.durationMilliseconds++; },
    r => { r.source.gridSha256 = '0'.repeat(64); },
    r => { delete r.binding; }, r => { r.rankingEligible = true; },
    r => { r.unit = 'people_per_hour'; }, r => { r.evidenceType = 'route_index'; },
    r => { r.coverageFraction = 1; }, r => { r.value = .25; },
    r => { r.sunlitFractionBounds = [.6, .5]; }, r => { r.modeledSunlitMinutesBounds = [1, 100]; },
    r => { r.lengthsMeters.unknown = -1; }, r => { r.model.radiusMeters = 1000; },
  ];
  for (const mutate of mutations) {
    const altered = structuredClone(data); mutate(altered.routes[0]);
    await assert.rejects(importPredictionResult(altered, syntheticRoute()));
  }
  await assert.rejects(importPredictionResult({ ...data, routes: [...data.routes, ...data.routes] }, syntheticRoute()));
});

test('import retains unknown support and never changes costs, evidence, preferences or ranking', async () => {
  const r = syntheticRoute(), before = structuredClone(r), preferences = structuredClone(initialPreferences);
  const ranks = rankRoutes([r], preferences);
  const result = await importPredictionResult(await exampleResult(), r);
  assert.equal(result.value, null);
  assert.equal(result.lengthsMeters.night, 25);
  assert.equal(result.rankingEligible, false);
  assert.deepEqual(r, before); assert.deepEqual(preferences, initialPreferences);
  assert.deepEqual(rankRoutes([r], preferences), ranks);
});

test('DST offsets bind distinct instants, independent of visitor timezone', async () => {
  const r = syntheticRoute();
  const a = await exportPredictionRoutes([r], new Date('2026-11-01T01:55:00-05:00'));
  const b = await exportPredictionRoutes([r], new Date('2026-11-01T01:55:00-06:00'));
  assert.notEqual(a.routes[0].binding.requestSha256, b.routes[0].binding.requestSha256);
  assert.equal(new Date(b.departureAt).getTime() - new Date(a.departureAt).getTime(), 3600000);
});

test('native research UI is collapsed, excludes demo routes and renders without browser globals', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom', esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': fileURLToPath(new URL('..', import.meta.url)) } } });
  try {
    const { ResearchPredictionTools } = await server.ssrLoadModule('/src/components/research-prediction-tools.tsx');
    const route = syntheticRoute();
    const html = renderToStaticMarkup(createElement(ResearchPredictionTools, { route, sunContext: calculateSunContext(new Date()) }));
    assert.match(html, /Offline sunlight research/); assert.match(html, /type="file"/);
    assert.doesNotMatch(html, /<details[^>]*\bopen/);
    assert.match(html, /separate from route ranking/);
    assert.equal(renderToStaticMarkup(createElement(ResearchPredictionTools, { route: { ...route, source: undefined } })), '');
  } finally { await server.close(); }
});
