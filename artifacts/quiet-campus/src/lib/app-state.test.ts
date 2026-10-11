import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSavedPreferences, defaultSavedPreferences, encodeSavedPreferences, resolveAppScreen } from './app-state';

test('Reports is an independent restorable fourth screen', () => {
  assert.equal(resolveAppScreen('#reports'), 'reports');
  assert.equal(resolveAppScreen('#reports-title'), 'reports');
});

test('home and obsolete Install fragments resolve to Map; existing screen links remain valid', () => {
  for (const hash of ['', '#map', '#map-title', '#install', '#install-title', '#unknown']) assert.equal(resolveAppScreen(hash), 'map');
  for (const hash of ['#preferences', '#preferences-title']) assert.equal(resolveAppScreen(hash), 'preferences');
  for (const hash of ['#routes', '#routes-title']) assert.equal(resolveAppScreen(hash), 'routes');
});

test('importance, acceptance, extra minutes and locks round trip without changing totals', () => {
  const saved = defaultSavedPreferences();
  saved.preferences = { ...saved.preferences, avoidNoise: 70, avoidCrowds: 10, preferShade: 10,
    prioritizeShortWalkingTime: 10, noiseAcceptance: 'low', maxExtraWalkingMinutes: 0 };
  saved.lockedWeights = ['avoidNoise'];
  assert.deepEqual(decodeSavedPreferences(encodeSavedPreferences(saved)), saved);
});

test('invalid/corrupt/old saved preferences reset safely instead of corrupting scoring', () => {
  const saved = defaultSavedPreferences();
  for (const raw of [null, '{', '[]', '{"version":0}', 'x'.repeat(8193),
    JSON.stringify({ version: 1, ...saved, preferences: { ...saved.preferences, avoidNoise: 99 } }),
    JSON.stringify({ version: 1, ...saved, preferences: { ...saved.preferences, noiseAcceptance: 'invalid' } }),
    JSON.stringify({ version: 1, ...saved, preferences: { ...saved.preferences, maxExtraWalkingMinutes: -1 } })]) {
    assert.deepEqual(decodeSavedPreferences(raw), saved);
  }
});

test('storage is a whitelist, not persistence of locations, credentials or imported datasets', () => {
  const saved = defaultSavedPreferences();
  const parsed = decodeSavedPreferences(JSON.stringify({ version: 1, ...saved,
    credentials: 'synthetic-private-value', origin: { latitude: 40.1 }, observations: [1],
    lockedWeights: ['avoidNoise', 'avoidNoise', 'unknown'],
    preferences: { ...saved.preferences, serverSecret: 'synthetic-private-value' } }));
  assert.deepEqual(parsed.lockedWeights, ['avoidNoise']);
  assert.ok(!encodeSavedPreferences(parsed).includes('synthetic-private-value'));
  assert.ok(!encodeSavedPreferences(parsed).includes('latitude'));
  assert.deepEqual(parsed.preferences, saved.preferences);
});
