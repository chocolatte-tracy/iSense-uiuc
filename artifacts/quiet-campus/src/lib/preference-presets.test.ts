import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPreferencePreset, preferencePresets, activePreferencePreset } from './preference-presets';
import { initialPreferences, weightKeys, type WeightKey } from './route-scoring';

test('explicit presets keep acceptance and walking minutes, total 100, and do not mutate old settings', () => {
  const previous = { ...initialPreferences, maxExtraWalkingMinutes: 7, noiseAcceptance: 'high' as const };
  const snapshot = { ...previous };
  for (const preset of preferencePresets) {
    const next = applyPreferencePreset(previous, preset.id);
    assert.deepEqual(weightKeys.map(key => next[key]), preset.weights);
    assert.equal(weightKeys.reduce((sum, key) => sum + next[key], 0), 100);
    assert.equal(next.maxExtraWalkingMinutes, 7);
    assert.equal(next.noiseAcceptance, 'high');
    assert.equal(next.crowdAcceptance, previous.crowdAcceptance);
    assert.equal(next.sunAcceptance, previous.sunAcceptance);
    assert.equal(activePreferencePreset(next), preset.id);
  }
  assert.deepEqual(previous, snapshot);
  assert.equal(activePreferencePreset(initialPreferences), undefined);
});
test('every preset respects all lock subsets with integral shares summing to 100', () => {
  for (let mask = 0; mask < 16; mask++) {
    const locks: WeightKey[] = weightKeys.filter((_, index) => mask & (1 << index));
    for (const preset of preferencePresets) {
      const next = applyPreferencePreset(initialPreferences, preset.id, locks);
      assert.equal(weightKeys.reduce((sum, key) => sum + next[key], 0), 100);
      weightKeys.forEach(key => assert.ok(Number.isInteger(next[key]) && next[key] >= 0));
      locks.forEach(key => assert.equal(next[key], initialPreferences[key]));
      if (locks.length >= 3) assert.equal(next, initialPreferences);
    }
  }
});
