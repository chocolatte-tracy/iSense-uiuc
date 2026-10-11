import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoRoutes } from './demo-routes.ts';
import { rankRoutes, rebalanceWeights, toggleWeightLock, weightAdjustmentLimits, resetPreferenceSettings, weightKeys, type PreferenceWeights } from './route-scoring.ts';
import { buildGoogleMapsURL } from './google-maps-url.ts';

const defaults: PreferenceWeights = {
  avoidNoise: 40, avoidCrowds: 30, preferShade: 20, prioritizeShortWalkingTime: 10,
  maxExtraWalkingMinutes: 5, noiseAcceptance: 'medium', crowdAcceptance: 'medium', sunAcceptance: 'medium',
};

test('every percentage setting keeps the total at 100 with integer shares', () => {
  let preferences = defaults;
  for (const key of weightKeys) {
    for (let value = 0; value <= 100; value++) {
      preferences = rebalanceWeights(preferences, key, value);
      assert.equal(preferences[key], value);
      assert.equal(weightKeys.reduce((sum, candidate) => sum + preferences[candidate], 0), 100);
      for (const candidate of weightKeys) assert.ok(Number.isInteger(preferences[candidate]) && preferences[candidate] >= 0);
      assert.equal(preferences.noiseAcceptance, 'medium');
      assert.equal(preferences.maxExtraWalkingMinutes, 5);
    }
  }
});

test('redistribution from all-zero peers is balanced; other shares remain proportional', () => {
  const allNoise = rebalanceWeights(defaults, 'avoidNoise', 100);
  const restored = rebalanceWeights(allNoise, 'avoidNoise', 40);
  assert.deepEqual(weightKeys.map((key) => restored[key]), [40, 20, 20, 20]);
  assert.deepEqual(weightKeys.map((key) => rebalanceWeights(defaults, 'avoidNoise', 70)[key]), [70, 15, 10, 5]);
});

test('acceptance filters matches, and importance can change the recommendation', () => {
  assert.deepEqual(rankRoutes(demoRoutes, defaults).map((route) => route.routeCode), ['A', 'B']);
  const tolerant = { ...defaults, noiseAcceptance: 'high', crowdAcceptance: 'high', sunAcceptance: 'high' } as PreferenceWeights;
  assert.equal(rankRoutes(demoRoutes, rebalanceWeights(tolerant, 'avoidNoise', 100))[0].routeCode, 'C');
  assert.equal(rankRoutes(demoRoutes, rebalanceWeights(tolerant, 'preferShade', 100))[0].routeCode, 'A');
  const strictSun = { ...tolerant, sunAcceptance: 'low' } as PreferenceWeights;
  assert.deepEqual(rankRoutes(demoRoutes, strictSun).map((route) => route.routeCode), ['A']);
});

test('no full sensory match gives honest fallback without relaxing the time limit', () => {
  const extreme = demoRoutes.map((route) => ({ ...route, noiseCost: 95 }));
  const results = rankRoutes(extreme, { ...defaults, noiseAcceptance: 'low', maxExtraWalkingMinutes: 0 });
  assert.equal(results.length, 2);
  assert.ok(results.every((route) => !route.meetsAcceptance && route.walkingTimeMinutes === 9));
});

test('zero extra minutes handles A/B time ties and excludes the ten-minute route', () => {
  const preferences = rebalanceWeights({ ...defaults, noiseAcceptance: 'high', crowdAcceptance: 'high', sunAcceptance: 'high', maxExtraWalkingMinutes: 0 }, 'prioritizeShortWalkingTime', 100);
  assert.deepEqual(rankRoutes(demoRoutes, preferences).map((route) => route.routeCode), ['A', 'B']);
  assert.deepEqual(rankRoutes([...demoRoutes].reverse(), preferences).map((route) => route.routeCode), ['A', 'B']);
  assert.equal(rankRoutes(demoRoutes, { ...preferences, maxExtraWalkingMinutes: 1 }).length, 3);
  assert.deepEqual(rankRoutes([], preferences), []);
});

test('each original route retains its independent Google Maps waypoints', () => {
  for (const route of demoRoutes) {
    const url = new URL(buildGoogleMapsURL(route));
    assert.equal(url.searchParams.get('api'), '1');
    assert.equal(url.searchParams.get('travelmode'), 'walking');
    assert.equal(url.searchParams.get('waypoints'), route.candidateWaypoints.map((point) => `${point.latitude},${point.longitude}`).join('|'));
  }
  assert.deepEqual(demoRoutes.map((route) => [route.walkingTimeMinutes, route.distanceMiles]), [[9, 0.4], [9, 0.4], [10, 0.5]]);
});

test('locking Noise at 40 then raising Crowds to 40 preserves Noise exactly', () => {
  const result = rebalanceWeights(defaults, 'avoidCrowds', 40, ['avoidNoise']);
  assert.deepEqual(weightKeys.map((key) => result[key]), [40, 40, 13, 7]);
  assert.equal(result.noiseAcceptance, defaults.noiseAcceptance);
  assert.equal(result.maxExtraWalkingMinutes, defaults.maxExtraWalkingMinutes);
  assert.equal(rebalanceWeights(defaults, 'avoidNoise', 90, ['avoidNoise']), defaults);
});

test('two locks permit changes only to Sun and Walking Time', () => {
  const result = rebalanceWeights(defaults, 'preferShade', 25, ['avoidNoise', 'avoidCrowds']);
  assert.deepEqual(weightKeys.map((key) => result[key]), [40, 30, 25, 5]);
});

test('three or four locks disable dragging without changing the remaining percentage', () => {
  const three = ['avoidNoise', 'avoidCrowds', 'preferShade'] as const;
  assert.equal(weightAdjustmentLimits(defaults, 'prioritizeShortWalkingTime', three).disabled, true);
  assert.equal(weightAdjustmentLimits(defaults, 'prioritizeShortWalkingTime', three).max, 10);
  assert.equal(rebalanceWeights(defaults, 'prioritizeShortWalkingTime', 99, three), defaults);
  for (const key of weightKeys) {
    assert.equal(weightAdjustmentLimits(defaults, key, weightKeys).disabled, true);
    assert.equal(rebalanceWeights(defaults, key, 0, weightKeys), defaults);
  }
});

test('requests above available budget clamp safely; zero budget disables adjustment', () => {
  const result = rebalanceWeights(defaults, 'avoidCrowds', 100, ['avoidNoise']);
  assert.deepEqual(weightKeys.map((key) => result[key]), [40, 60, 0, 0]);
  const concentrated = rebalanceWeights(defaults, 'avoidNoise', 100);
  assert.equal(weightAdjustmentLimits(concentrated, 'avoidCrowds', ['avoidNoise']).disabled, true);
  assert.equal(rebalanceWeights(concentrated, 'avoidCrowds', 50, ['avoidNoise']), concentrated);
});

test('largest-remainder ties use stable order and unlocking enables redistribution', () => {
  const equalPeers = { ...defaults, avoidNoise: 40, avoidCrowds: 1, preferShade: 1, prioritizeShortWalkingTime: 58 };
  const result = rebalanceWeights(equalPeers, 'prioritizeShortWalkingTime', 59, ['avoidNoise']);
  assert.deepEqual(weightKeys.map((key) => result[key]), [40, 1, 0, 59]);
  let locks = toggleWeightLock([], 'avoidNoise');
  assert.deepEqual(locks, ['avoidNoise']);
  locks = toggleWeightLock(locks, 'avoidNoise');
  assert.deepEqual(locks, []);
  assert.equal(weightAdjustmentLimits(defaults, 'avoidNoise', locks).disabled, false);
  assert.equal(rebalanceWeights(defaults, 'avoidNoise', 60, locks).avoidNoise, 60);
  const zeroPeers = { ...defaults, avoidNoise: 40, avoidCrowds: 60, preferShade: 0, prioritizeShortWalkingTime: 0 };
  assert.deepEqual(weightKeys.map((key) => rebalanceWeights(zeroPeers, 'avoidCrowds', 20, ['avoidNoise'])[key]), [40, 20, 20, 20]);
});

test('all lock combinations preserve integer totals, bounds and locked values', () => {
  for (let mask = 0; mask < 16; mask++) {
    const locked = weightKeys.filter((_, index) => Boolean(mask & (1 << index)));
    let preferences = defaults;
    for (const key of weightKeys) {
      for (let value = 0; value <= 100; value++) {
        const previous = preferences;
        preferences = rebalanceWeights(preferences, key, value, locked);
        assert.equal(weightKeys.reduce((sum, candidate) => sum + preferences[candidate], 0), 100);
        for (const candidate of weightKeys) assert.ok(Number.isInteger(preferences[candidate]) && preferences[candidate] >= 0 && preferences[candidate] <= 100);
        for (const candidate of locked) assert.equal(preferences[candidate], previous[candidate]);
      }
    }
  }
});

test('unlocked changes with a locked peer still update route recommendations', () => {
  const tolerant = { ...defaults, noiseAcceptance: 'high', crowdAcceptance: 'high', sunAcceptance: 'high' } as PreferenceWeights;
  assert.equal(rankRoutes(demoRoutes, tolerant)[0].routeCode, 'A');
  const updated = rebalanceWeights(tolerant, 'avoidNoise', 70, ['avoidCrowds']);
  assert.equal(updated.avoidCrowds, 30);
  assert.equal(rankRoutes(demoRoutes, updated)[0].routeCode, 'C');
});

test('Reset supplies fresh default preferences and clears every lock', () => {
  const reset = resetPreferenceSettings();
  assert.deepEqual(reset.preferences, defaults);
  assert.deepEqual(reset.lockedWeights, []);
  assert.equal(weightKeys.reduce((sum, key) => sum + reset.preferences[key], 0), 100);
  for (const key of weightKeys) assert.equal(weightAdjustmentLimits(reset.preferences, key, reset.lockedWeights).disabled, false);
  reset.preferences.avoidNoise = 99;
  reset.lockedWeights.push('avoidNoise');
  assert.deepEqual(resetPreferenceSettings(), { preferences: defaults, lockedWeights: [] });
});
