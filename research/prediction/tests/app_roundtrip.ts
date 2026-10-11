/** Run: scripts/node_modules/.bin/tsx research/prediction/tests/app_roundtrip.ts "$(command -v python3)" */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { adaptWalkingRoutes } from '../../../artifacts/quiet-campus/src/lib/live-routes';
import { exportPredictionRoutes, importPredictionResult } from '../../../artifacts/quiet-campus/src/lib/research-prediction';
import { initialPreferences, rankRoutes } from '../../../artifacts/quiet-campus/src/lib/route-scoring';

async function main() {
  if (!process.argv[2]) throw new Error('Pass the Python interpreter with research dependencies installed.');
  const python = resolve(process.argv[2]);
  // Synthetic, non-navigable test geometry. Real downloaded DSM/DTM; no Google request.
  const [route] = adaptWalkingRoutes({ source: 'google-routes-live', routeCount: 1, alternativesReturned: false,
    routes: [{ id: 'synthetic-offline-fixture', durationSeconds: 185.25, durationMinutes: 3.0875,
      distanceMeters: 240, encodedPolyline: 'synthetic-not-for-navigation', labels: [],
      path: [{ lat: 40.108, lng: -88.2272 }, { lat: 40.1088, lng: -88.2274 }, { lat: 40.110, lng: -88.2272 }] }] },
    { origin: 'synthetic origin', destination: 'synthetic destination' },
    { originId: 'test-a', destinationId: 'test-b', originName: 'Test A', destinationName: 'Test B' });
  const temp = mkdtempSync(join(tmpdir(), 'isense-roundtrip-'));
  const before = rankRoutes([route], initialPreferences);
  try {
    for (const departure of ['2026-06-21T10:00:00-05:00', '2026-06-21T23:00:00-05:00', '2026-11-01T01:55:00-05:00']) {
      const request = await exportPredictionRoutes([route], new Date(departure));
      writeFileSync(join(temp, 'request.json'), JSON.stringify(request));
      execFileSync(python, ['research/prediction/app_routes.py', '--request', join(temp, 'request.json'), '--output', join(temp, 'result.json')]);
      const result = await importPredictionResult(JSON.parse(readFileSync(join(temp, 'result.json'), 'utf8')), route);
      assert.equal(result.rankingEligible, false);
      assert.equal(result.departureAt, new Date(departure).toISOString());
      assert.equal(result.binding.durationMilliseconds, 185250);
      assert.deepEqual(rankRoutes([route], initialPreferences), before);
      if (departure.includes('23:00') || departure.includes('01:55')) {
        assert.equal(result.lengthsMeters.shaded, 0);
        assert.equal(result.lengthsMeters.night, result.totalRouteLengthMeters);
      }
      console.log(JSON.stringify({ fixture: 'SYNTHETIC geometry + acquired terrain', departure, coverage: result.coverageFraction, sunlit: result.sunlitFractionBounds, rankingEligible: result.rankingEligible }));
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
