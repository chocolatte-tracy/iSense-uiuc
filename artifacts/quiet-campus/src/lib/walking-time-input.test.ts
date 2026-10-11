import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWalkingMinutes } from './walking-time-input';
import { initialPreferences, rankRoutes } from './route-scoring';
import { demoRoutes } from './demo-routes';

test('walking-time input accepts nonnegative whole minutes, including values above 10', () => {
  for (const minutes of [0, 1, 5, 15, 120]) {
    assert.equal(parseWalkingMinutes(String(minutes)), minutes);
  }
});

test('empty, negative, fractional and invalid edits cannot change the active limit', () => {
  for (const input of ['', ' ', '-1', '2.5', 'NaN', 'Infinity', '1e2', 'abc', '9007199254740992']) {
    assert.equal(parseWalkingMinutes(input), null);
  }
});

test('typed minutes preserve the hard extra-time limit and fastest-route ties', () => {
  const preferences = { ...initialPreferences, noiseAcceptance: 'high', crowdAcceptance: 'high', sunAcceptance: 'high' } as const;
  const zero = rankRoutes(demoRoutes, { ...preferences, maxExtraWalkingMinutes: parseWalkingMinutes('0')! });
  assert.equal(zero.length, 2);
  assert.ok(zero.every((route) => route.walkingTimeMinutes === 9));
  assert.equal(rankRoutes(demoRoutes, { ...preferences, maxExtraWalkingMinutes: parseWalkingMinutes('1')! }).length, 3);
});
