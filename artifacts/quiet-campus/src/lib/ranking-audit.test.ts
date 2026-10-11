import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRoutes, applySunContext } from './route-scoring';
import { illustrativePreferences as preferences, illustrativeRankingRoutes } from './ranking-fixtures';
import { rankingMetricEvidence } from './ranking-evidence';
import { auditRouteRanking } from './route-ranking-audit';
import { applyCampusObservations, parseObservationDataset } from './campus-observations';
import { calculateSunContext, UIUC_SUN_LOCATION } from './sun-context';
import { routeTradeoffs } from './route-tradeoffs';

test('SYNTHETIC crowd and noise 100% prefer lower supported exposures; time 100% prefers fastest', () => {
  const routes = illustrativeRankingRoutes();
  assert.equal(rankRoutes(routes, preferences)[0].id, 'quiet-test');
  assert.equal(rankRoutes(routes, { ...preferences, avoidCrowds: 0, avoidNoise: 100 })[0].id, 'quiet-test');
  assert.equal(rankRoutes(routes, { ...preferences, avoidCrowds: 0, prioritizeShortWalkingTime: 100 })[0].id, 'green-test');
});

test('all-zero importance falls back to shortest walking time and a finite additive breakdown', () => {
  const zero = { ...preferences, avoidCrowds: 0 };
  const ranked = rankRoutes(illustrativeRankingRoutes(), zero);
  assert.equal(ranked[0].id, 'green-test');
  assert.ok(ranked.every(route => Number.isFinite(route.score)));
  for (const route of ranked) assert.equal(route.scoreBreakdown.reduce((sum, item) => sum + item.contribution, 0), route.score);
});

test('strict and relaxed acceptance preserve exact thresholds and hard walking constraints', () => {
  const routes = illustrativeRankingRoutes();
  assert.deepEqual(rankRoutes(routes, { ...preferences, crowdAcceptance: 'low' }).map(route => route.id), ['quiet-test']);
  assert.equal(rankRoutes(routes, preferences).length, 3);
  assert.equal(rankRoutes(routes, { ...preferences, maxExtraWalkingMinutes: 0 })[0].id, 'green-test');
  assert.equal(rankRoutes(routes, { ...preferences, maxExtraWalkingMinutes: 0, crowdAcceptance: 'low' })[0].acceptanceStatus, 'exceeded');
});

test('missing live crowd evidence is not a measured zero or a favorable 50-point score', () => {
  const routes = illustrativeRankingRoutes();
  const missing = { ...routes[0], walkingTimeMinutes: 8, crowdCost: 0,
    sensoryEvidence: { ...routes[0].sensoryEvidence!, metrics: { ...routes[0].sensoryEvidence!.metrics,
      crowds: { status: 'demo' as const, verifiedPercent: 0, estimatedPercent: 0, demoPercent: 100, observationIds: [] } } } };
  const evidence = rankingMetricEvidence(missing, 'crowds');
  assert.equal(evidence.displayValue, null);
  assert.equal(evidence.rankingValue, 100);
  assert.equal(rankRoutes([missing, ...routes.slice(1)], preferences)[0].id, 'quiet-test');
  const onlyMissing = rankRoutes([missing], preferences)[0];
  assert.equal(onlyMissing.acceptanceStatus, 'unknown');
  assert.equal(onlyMissing.provisional, true);
});

test('non-finite/malformed scores cannot become quiet or yield NaN ranking costs', () => {
  for (const crowdCost of [NaN, Infinity, -1, 101]) {
    const route = { ...illustrativeRankingRoutes()[0], crowdCost };
    assert.equal(rankingMetricEvidence(route, 'crowds').rankingValue, 100);
    assert.equal(rankRoutes([route], preferences)[0].score, 25);
    assert.equal(rankRoutes([route], preferences)[0].acceptanceStatus, 'unknown');
  }
});

test('missing live observations never produce reassuring sensory pros from placeholder values', () => {
  const routes = illustrativeRankingRoutes();
  const missing = { ...routes[0], sensoryEvidence: undefined, noiseCost: 50, crowdCost: 50, sunExposureCost: 50 };
  const advice = routeTradeoffs(missing, [missing, routes[1]], preferences);
  assert.deepEqual(advice.pros, ['Shortest walking time among these options; ties possible.']);
  assert.equal(advice.cons.filter(message => message.includes('comfort cannot be confirmed')).length, 3);
});

test('partial coverage keeps original 50-point demo blend but reserves uncertainty only for ranking', () => {
  const route = illustrativeRankingRoutes()[0];
  route.crowdCost = 35; // SYNTHETIC: half observed at 20, half placeholder at 50.
  route.sensoryEvidence!.metrics.crowds = { status: 'mixed', verifiedPercent: 50,
    estimatedPercent: 0, demoPercent: 50, observationIds: ['SYNTHETIC-half-covered'] };
  const evidence = rankingMetricEvidence(route, 'crowds');
  assert.equal(evidence.displayValue, 35);
  assert.equal(evidence.rankingValue, 60); // Half at 20 + unknown half reserved at 100.
  assert.equal(route.crowdCost, 35);
  assert.equal(rankRoutes([route], preferences)[0].acceptanceStatus, 'unknown');
});

test('equal costs use walking time then geometry, not Google response IDs/order', () => {
  const routes = illustrativeRankingRoutes().map(route => ({ ...route, crowdCost: 20, walkingTimeMinutes: 9 }));
  const winnerPath = rankRoutes(routes, preferences)[0].coordinates;
  const reversed = [...routes].reverse().map((route, index) => ({ ...route, id: `response-local-${index}` }));
  assert.deepEqual(rankRoutes(reversed, preferences)[0].coordinates, winnerPath);
});

test('night excludes direct sun without changing saved preferences; daytime restores original values', () => {
  const night = calculateSunContext(new Date('2026-10-11T05:00:00Z'), UIUC_SUN_LOCATION);
  const day = calculateSunContext(new Date('2026-10-11T18:00:00Z'), UIUC_SUN_LOCATION);
  const settings = { ...preferences, avoidCrowds: 0, preferShade: 100 };
  const saved = { ...settings };
  const routes = illustrativeRankingRoutes();
  assert.equal(rankRoutes(routes, settings, night)[0].id, 'green-test');
  assert.ok(rankRoutes(routes, settings, night).every(route => route.scoreBreakdown[2].weight === 0));
  assert.equal(applySunContext(applySunContext(routes[0], night), day).sunExposureCost, routes[0].sunExposureCost);
  assert.deepEqual(settings, saved);
});

test('geometry matching survives Google result reorder but not a different endpoint/path', () => {
  const routes = illustrativeRankingRoutes();
  const dataset = parseObservationDataset({ version: 1,
    segments: [{ id: 'SYNTHETIC-segment', name: 'SYNTHETIC geometry', direction: 'forward', path: routes[1].coordinates }],
    observations: [{ id: 'SYNTHETIC-observation', segmentId: 'SYNTHETIC-segment',
      source: 'SYNTHETIC OFFLINE DATA', conditions: 'Not campus measurements', observedAt: '2026-03-13T12:00:00Z',
      crowds: { value: 20, status: 'verified', method: 'SYNTHETIC TEST ONLY',
        reviewedBy: 'Synthetic fixture', reviewedAt: '2026-03-14T12:00:00Z' } }] });
  const mapped = routes.map(route => applyCampusObservations(route, dataset));
  assert.equal(mapped[1].sensoryEvidence!.metrics.crowds.verifiedPercent, 100);
  const changed = applyCampusObservations({ ...routes[1], originId: 'changed-start',
    coordinates: [[40.108, -88.23], [40.113, -88.22]] }, dataset);
  assert.equal(changed.sensoryEvidence!.metrics.crowds.demoPercent, 100);
  assert.equal(changed.crowdCost, 50);
  assert.equal(rankingMetricEvidence(changed, 'crowds').rankingValue, 100);
  const shuffled = [...routes].reverse().map((route, index) => applyCampusObservations({ ...route, id: `new-${index}` }, dataset));
  assert.deepEqual(shuffled.find(route => route.name === routes[1].name)!.sensoryEvidence!.metrics.crowds, mapped[1].sensoryEvidence!.metrics.crowds);
});

test('local preference changes and audits never call Google Routes or any network', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; throw new Error('No network permitted'); }) as typeof fetch;
  try {
    const routes = illustrativeRankingRoutes();
    rankRoutes(routes, preferences);
    rankRoutes(routes, { ...preferences, avoidCrowds: 0, avoidNoise: 100 });
    const report = auditRouteRanking(routes, preferences);
    assert.equal(report[1].finalCost, 5);
    assert.ok(report.every(row => row.name.includes('SYNTHETIC')));
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
