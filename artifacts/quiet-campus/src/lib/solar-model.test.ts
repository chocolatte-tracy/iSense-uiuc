import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBrowserGrid, gridMetadata, type SolarGrid } from './solar-grid';
import { traceSun, predictBrowserSunlight } from './solar-model';
import { solarPosition } from './solar-position';
import { exportPredictionRoutes, importPredictionResult, routeSnapshotKey, type ResearchPrediction } from './research-prediction';
import { rankRoutes, initialPreferences, type DemoRoute } from './route-scoring';
import { usableAutomaticSunlight } from './solar-ranking';
import { rankingMetricEvidence } from './ranking-evidence';
import { calculateSunContext } from './sun-context';

const departure = new Date('2026-06-21T15:00:00Z');
// Synthetic unit geometry, not a verified walking route.
const route: DemoRoute = {
  id: 'synthetic', routeCode: 'A', name: 'Synthetic fixture', source: 'google',
  originId: 'test-a', destinationId: 'test-b', originName: 'Test A', destinationName: 'Test B',
  walkingTimeMinutes: 9, durationSeconds: 540, distanceMiles: .3,
  noiseCost: 50, crowdCost: 50, sunExposureCost: 50,
  coordinates: [[40.108, -88.2272], [40.1088, -88.2274], [40.110, -88.2272]],
  candidateWaypoints: [], researchSourceUrl: '',
};
async function modeled(input: DemoRoute, fraction: number, unknown = 0): Promise<DemoRoute> {
  const binding = (await exportPredictionRoutes([input], departure)).routes[0].binding;
  const result: ResearchPrediction = {
    schemaVersion: '2.3', routeId: input.id, binding, departureAt: departure.toISOString(),
    evidenceType: 'modeled_direct_sunlight', metric: 'direct_sunlit_length_fraction', unit: 'fraction',
    rankingEligible: false, status: 'modeled', value: unknown ? null : fraction,
    coverageFraction: 1 - unknown, sunlitFractionBounds: [fraction, fraction + unknown],
    modeledSunlitMinutesBounds: [fraction * input.walkingTimeMinutes, (fraction + unknown) * input.walkingTimeMinutes],
    totalRouteLengthMeters: 100, coveredRouteLengthMeters: 100 * (1 - unknown),
    lengthsMeters: { sunlit: fraction * 100, shaded: (1 - fraction - unknown) * 100, night: 0, unknown: unknown * 100 },
    source: { gridSha256: '109eca2ad7406836a932d1d50297488ae60491a69efa4e099c08d6f4fd38b902' },
    model: { id: 'dsm-solar-raytrace', version: '0.1', radiusMeters: 300, receiverHeightMeters: 1.5, routeSpacingMeters: 5, constantWalkingSpeedAssumption: true },
    limitations: ['Synthetic test result, not field validated'], boundsMeaning: 'Missing support only',
  };
  return { ...input, automaticSunlight: { snapshot: routeSnapshotKey(input), result } };
}

test('modeled physical sun percentage participates in existing weighted ranking', async () => {
  const sunny = await modeled(route, .85);
  const shady = await modeled({ ...route, id: 'shade', walkingTimeMinutes: 10, durationSeconds: 600 }, .15);
  const shadePriority = { ...initialPreferences, avoidNoise: 0, avoidCrowds: 0, preferShade: 90, prioritizeShortWalkingTime: 10, sunAcceptance: 'high' as const };
  assert.equal(rankRoutes([sunny, shady], shadePriority)[0].id, 'shade');
  assert.equal(rankRoutes([sunny, shady], { ...shadePriority, preferShade: 0, prioritizeShortWalkingTime: 100 })[0].id, sunny.id);
  assert.equal(sunny.sunExposureCost, 50, 'Original unmapped placeholder is not rewritten as an observation');
  assert.equal(rankingMetricEvidence(sunny, 'sunlight').status, 'modeled');
  assert.equal(rankingMetricEvidence(sunny, 'sunlight').verifiedPercent, 0);
  assert.equal(rankingMetricEvidence(sunny, 'sunlight').rankingValue, 85);
  assert.equal(sunny.automaticSunlight?.result.rankingEligible, false, 'Research validation flag must not be fabricated');
});
test('modeled ranking preserves extra-walking cap and independent acceptance', async () => {
  const sunny = await modeled(route, .8);
  const shade = await modeled({ ...route, id: 'shade', durationSeconds: 600, walkingTimeMinutes: 10 }, .1);
  assert.equal(rankRoutes([sunny, shade], { ...initialPreferences, maxExtraWalkingMinutes: 0 })[0].id, sunny.id);
  const common = { ...initialPreferences, noiseAcceptance: 'high' as const, crowdAcceptance: 'high' as const, sunAcceptance: 'low' as const };
  assert.deepEqual(rankRoutes([sunny, shade], common).map(r => r.id), ['shade']);
});
test('partial, unknown, stale shape, duration and departure are not reused for ranking', async () => {
  const full = await modeled(route, .2);
  const partial = await modeled(route, .2, .1);
  assert.equal(usableAutomaticSunlight(partial), null);
  assert.equal(rankingMetricEvidence(partial, 'sunlight').status, 'unknown');
  assert.equal(usableAutomaticSunlight({ ...full, durationSeconds: 541 }), null);
  assert.equal(usableAutomaticSunlight({ ...full, coordinates: [[40.108, -88.2272], [40.109, -88.2274]] }), null);
  assert.equal(usableAutomaticSunlight(full, new Date(departure.getTime() + 1000)), null);
  assert.equal(usableAutomaticSunlight({ ...full, source: undefined }), null);
});
test('whole-trip modeled sun takes precedence when a walk starts before sunrise', async () => {
  const time = new Date(calculateSunContext(departure).sunrise!.getTime() - 120000);
  const full = await modeled(route, .2);
  const result = full.automaticSunlight!.result;
  full.automaticSunlight = { ...full.automaticSunlight!, result: {
    ...result, departureAt: time.toISOString(), binding: (await exportPredictionRoutes([route], time)).routes[0].binding,
  } };
  const context = calculateSunContext(time);
  assert.equal(context.phase, 'nighttime');
  const ranked = rankRoutes([full], initialPreferences, context);
  const sunlight = ranked[0].scoreBreakdown.find(item => item.metric === 'sunlight')!;
  assert.ok(sunlight.weight > 0, 'Whole-trip sunlight must not be suppressed by departure alone');
  assert.equal(sunlight.rankingValue, 20);
  assert.equal(sunlight.evidence?.status, 'modeled');
  const stale = rankRoutes([full], initialPreferences, { ...context, departureTime: new Date(time.getTime() + 1000) })[0];
  assert.equal(stale.scoreBreakdown.find(item => item.metric === 'sunlight')!.evidence?.status, 'excluded');
});
test('rays preserve night, low-sun, obstruction and missing-support semantics', () => {
  const grid: SolarGrid = { ...gridMetadata, dsm: new Float64Array(360000), dtm: new Float64Array(360000) };
  const x = (grid.xmin + grid.xmax) / 2, y = (grid.ymin + grid.ymax) / 2;
  assert.equal(traceSun(grid, x, y, -5, 90), 'night');
  assert.equal(traceSun(grid, x, y, 5, 90), 'unknown');
  assert.equal(traceSun(grid, x, y, 45, 90), 'sunlit');
  grid.dsm.fill(10);
  assert.equal(traceSun(grid, x, y, 45, 90), 'shaded');
  grid.dsm.fill(0);
  assert.equal(traceSun(grid, grid.xmax - 1, y, 45, 90), 'unknown');
});
test('NOAA geometric solar position handles night and leap years', () => {
  assert.ok(solarPosition(departure, 40.108, -88.2272).elevation > 10);
  assert.ok(solarPosition(new Date('2026-06-22T04:00:00Z'), 40.108, -88.2272).elevation < 0);
  assert.ok(Number.isFinite(solarPosition(new Date('2028-02-29T18:00:00Z'), 40.108, -88.2272).azimuth));
});

const gridPath = new URL('../../../../research/prediction/data/campus-grid.npz', import.meta.url);
test('browser model matches original Python with the actual reviewed terrain cache', { skip: !existsSync(gridPath) }, async () => {
  const bytes = readFileSync(gridPath);
  const grid = await loadBrowserGrid(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const dir = mkdtempSync(join(tmpdir(), 'isense-browser-solar-'));
  try {
    for (const time of ['2026-06-21T15:00:00Z', '2026-06-22T04:00:00Z', '2026-11-01T06:55:00Z']) {
      const request = await exportPredictionRoutes([
        route,
        { ...route, id: 'partial-window', coordinates: [[40.117, -88.22], [40.122, -88.216]], durationSeconds: 625.75 },
      ], new Date(time));
      writeFileSync(join(dir, 'request.json'), JSON.stringify(request));
      execFileSync('python3', ['research/prediction/app_routes.py', '--request', join(dir, 'request.json'), '--output', join(dir, 'result.json')]);
      const python = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')).routes as ResearchPrediction[];
      for (let i = 0; i < request.routes.length; i++) {
        const predicted = predictBrowserSunlight(request.routes[i], grid);
        assert.equal(predicted.status, python[i].status);
        assert.equal(predicted.value === null, python[i].value === null);
        assert.ok(Math.abs(predicted.coverageFraction - python[i].coverageFraction) < 1e-7);
        for (const k of ['sunlit', 'shaded', 'night', 'unknown'] as const)
          assert.ok(Math.abs(predicted.lengthsMeters[k] - python[i].lengthsMeters[k]) < .001, `${time} ${k}`);
        const imported = await importPredictionResult({ schemaVersion: 'isense-research-results-1', routes: [predicted] }, i === 0 ? route : { ...route, id: 'partial-window', coordinates: [[40.117, -88.22], [40.122, -88.216]], durationSeconds: 625.75 });
        assert.equal(imported.departureAt, time.replace('Z', '.000Z'));
      }
    }
    await assert.rejects(loadBrowserGrid(new Uint8Array([0, 1, 2]).buffer), /integrity/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
