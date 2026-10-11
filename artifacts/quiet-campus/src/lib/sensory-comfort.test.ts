import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptanceLimits, initialPreferences, rankRoutes, resetPreferenceSettings, weightKeys } from './route-scoring';
import { comfortFactors, comfortLevels, comfortOptions, comfortRangeNotes } from './sensory-comfort';
import { demoRoutes } from './demo-routes';
import { routeTradeoffs } from './route-tradeoffs';

test('factor-specific labels preserve the three original internal thresholds', () => {
  assert.deepEqual(comfortLevels.map(level => acceptanceLimits[level]), [33, 66, 100]);
  assert.deepEqual(comfortLevels.map(level => comfortOptions.noiseAcceptance[level].label), ['Very Quiet', 'Quiet', 'No Noise Limit']);
  assert.deepEqual(comfortLevels.map(level => comfortOptions.crowdAcceptance[level].label), ['Nearly Empty', 'Not Too Crowded', 'No Crowd Limit']);
  assert.deepEqual(comfortLevels.map(level => comfortOptions.sunAcceptance[level].label), ['Mostly Shaded', 'Some Sun Is Okay', 'No Sun Exposure Limit']);
});

test('each choice exposes its range and Medium includes Low without changing prototype cutoffs', () => {
  assert.equal(comfortRangeNotes.noiseAcceptance.low.range, 'Trial: <45 dB(A)');
  assert.equal(comfortRangeNotes.noiseAcceptance.medium.range, 'Trial: <55 dB(A)');
  assert.equal(comfortRangeNotes.noiseAcceptance.medium.levels, 'Low + Medium noise');
  assert.equal(comfortRangeNotes.crowdAcceptance.low.range, 'Trial: 0–<0.18 people/m²');
  assert.equal(comfortRangeNotes.crowdAcceptance.medium.range, 'Trial: 0–<0.45 people/m²');
  assert.match(comfortRangeNotes.crowdAcceptance.medium.levels, /Reviewed Empty \+ Low \+ Medium/);
  for (const factor of comfortFactors) for (const level of comfortLevels) {
    assert.ok(comfortRangeNotes[factor.key][level].range);
    assert.ok(comfortRangeNotes[factor.key][level].levels);
  }
  for (const level of comfortLevels) {
    assert.match(comfortRangeNotes.sunAcceptance[level].range, /Prototype index/);
    assert.equal(comfortRangeNotes.sunAcceptance[level].levels, 'No validated physical range');
  }
  assert.deepEqual(comfortLevels.map(level => acceptanceLimits[level]), [33, 66, 100]);
});

test('each comfort choice independently changes only its factor and preserves importance', () => {
  for (const factor of comfortFactors) for (const level of comfortLevels) {
    const preferences = { ...initialPreferences, [factor.key]: level };
    for (const other of comfortFactors.filter(other => other.key !== factor.key))
      assert.equal(preferences[other.key], initialPreferences[other.key]);
    assert.equal(weightKeys.reduce((sum, key) => sum + preferences[key], 0), 100);
  }
  const quietPriority = { ...initialPreferences, avoidNoise: 100, avoidCrowds: 0, preferShade: 0, prioritizeShortWalkingTime: 0 };
  assert.equal(rankRoutes(demoRoutes, quietPriority)[0].id, 'route-a');
  assert.equal(rankRoutes(demoRoutes, { ...quietPriority, sunAcceptance: 'high' })[0].id, 'route-c');
});

test('reset retains the original importance and comfort defaults', () => {
  const { preferences, lockedWeights } = resetPreferenceSettings();
  assert.deepEqual(preferences, initialPreferences);
  assert.deepEqual(weightKeys.map(key => preferences[key]), [40, 30, 20, 10]);
  assert.deepEqual(comfortFactors.map(factor => preferences[factor.key]), ['medium', 'medium', 'medium']);
  assert.deepEqual(lockedWeights, []);
});

test('pros and cons derive from indices, trip alternatives, and current comfort cutoffs', () => {
  const c = routeTradeoffs(demoRoutes[2], demoRoutes, initialPreferences);
  assert.ok(c.pros.some(text => text.includes('Noise: lowest index')));
  assert.ok(c.cons.some(text => text.includes('Some Sun Is Okay') && text.includes('68/100')));
  assert.ok(c.cons.includes('1 min longer than the shortest option.'));
  const unrestrictedSun = routeTradeoffs(demoRoutes[2], demoRoutes, { ...initialPreferences, sunAcceptance: 'high' });
  assert.ok(!unrestrictedSun.cons.some(text => text.includes('exceeds')));
  assert.ok(unrestrictedSun.cons.some(text => text.includes('Sun Exposure: higher index')));
  assert.ok(routeTradeoffs(demoRoutes[1], demoRoutes, initialPreferences).pros.some(text => text.includes('Shortest')));
  assert.deepEqual(demoRoutes.map(route => route.walkingTimeMinutes), [9, 9, 10]);
});

test('unknown indices disclose missing evidence without inventing a sensory comparison', () => {
  const unknown = { ...demoRoutes[0], noiseCost: Number.NaN };
  const result = routeTradeoffs(unknown, [unknown], initialPreferences);
  assert.ok(!result.pros.some(text => text.includes('Noise:')));
  assert.ok(result.cons.some(text => text.includes('Noise: Unknown') && text.includes('comfort cannot be confirmed')));
  assert.ok(!result.cons.some(text => text.startsWith('Noise:') && /higher index|exceeds|lowest/.test(text)));
});
