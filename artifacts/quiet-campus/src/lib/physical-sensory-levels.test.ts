import assert from 'node:assert/strict';
import { test } from 'node:test';
import reference from '../data/historical-sensory-reference.json';
import { classifyNoise, classifyCrowd, physicalAcceptance } from './physical-sensory-levels';
import { routeTradeoffs } from './route-tradeoffs';
import { demoRoutes } from './demo-routes';
import { initialPreferences, rankRoutes } from './route-scoring';

const now = Date.parse('2026-10-10T23:00:00Z');
const context = { observedAt: '2026-03-13T22:48:09-05:00', source: 'Test fixture', quality: 'reviewed' as const };
const noise = (value: number) => classifyNoise({ ...context, noiseDb: value, noiseMetric: 'LAeq' }, now);
const crowd = (people: number, area: number) => classifyCrowd({
  ...context, measurementType: 'occupancy', location: 'Test area', peoplePresent: people, usableAreaM2: area,
}, now);

test('noise trial boundaries use physical dB(A), never the prototype 33/66/100 scale', () => {
  assert.equal(noise(44.999).level, 'Low');
  assert.equal(noise(45).level, 'Medium');
  assert.equal(noise(54.999).level, 'Medium');
  assert.equal(noise(55).level, 'High');
  assert.equal(noise(71.38826).value, 71.38826);
  assert.equal(noise(55).unit, 'dB(A)');
  for (const value of [NaN, Infinity, -Infinity, -1]) assert.equal(noise(value).level, 'Unknown');
});

test('crowd boundaries distinguish confirmed Empty and valid simultaneous density', () => {
  assert.equal(crowd(0, 100).level, 'Empty');
  assert.equal(crowd(17, 100).level, 'Low');
  assert.equal(crowd(18, 100).level, 'Medium');
  assert.equal(crowd(44, 100).level, 'Medium');
  assert.equal(crowd(45, 100).level, 'High');
  assert.equal(crowd(45, 100).value, 0.45);
  for (const people of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(crowd(people, 20).level, 'Unknown');
  for (const area of [0, -1, NaN, Infinity]) assert.equal(crowd(0, area).level, 'Unknown');
  assert.equal(crowd(1, Number.MIN_VALUE).level, 'Unknown');
});

test('missing/faulty/context-free data never becomes quiet or Empty', () => {
  const valid = { ...context, measurementType: 'occupancy', location: 'Test area', peoplePresent: 0, usableAreaM2: 20 };
  for (const change of [
    { observedAt: undefined }, { observedAt: '2026-03-13' }, { observedAt: '2026-02-30T12:00:00Z' },
    { observedAt: '2030-01-01T00:00:00Z' }, { quality: 'invalid' as const },
    { quality: 'unknown' as const }, { quality: 'source-reported' as const }, { source: '' },
    { location: '' }, { peoplePresent: undefined }, { usableAreaM2: undefined },
  ]) assert.equal(classifyCrowd({ ...valid, ...change }, now).level, 'Unknown');
  assert.equal(classifyNoise({ ...context, noiseDb: 39, noiseMetric: 'LAeq', quality: 'invalid' }, now).level, 'Unknown');
  assert.equal(classifyNoise({ noiseDb: 39 }, now).level, 'Unknown');
  assert.equal(classifyNoise({ ...context, noiseDb: 39, noiseMetric: 'LAmax' }, now).level, 'Unknown');
});

test('monthly counts and passing flow never become occupancy, even if fabricated area is supplied', () => {
  for (const measurementType of ['pedestrian_count', 'flow']) {
    assert.equal(classifyCrowd({ ...context, measurementType, peoplePresent: 0, usableAreaM2: 20, location: 'Fixture' }, now).level, 'Unknown');
  }
  assert.equal(classifyCrowd({ ...context, measurementType: 'occupancy', granularity: 'month', peoplePresent: 0, usableAreaM2: 20, location: 'Fixture' }, now).level, 'Unknown');
  for (const report of reference.crowds.examples)
    assert.equal(classifyCrowd({ ...report, ...context }, now).level, 'Unknown');
});

test('known-level acceptance explanations never confirm Unknown or change ranking', () => {
  for (const acceptance of ['low', 'medium', 'high'] as const) {
    assert.equal(physicalAcceptance('Unknown', acceptance), 'unknown');
    assert.equal(physicalAcceptance('Empty', acceptance), 'accepted');
    assert.equal(physicalAcceptance('Low', acceptance), 'accepted');
  }
  assert.equal(physicalAcceptance('Medium', 'low'), 'outside');
  assert.equal(physicalAcceptance('Medium', 'medium'), 'accepted');
  assert.equal(physicalAcceptance('High', 'medium'), 'outside');
  assert.equal(physicalAcceptance('High', 'high'), 'accepted');
  const before = rankRoutes(demoRoutes, initialPreferences);
  reference.noise.examples.forEach(r => noise(r.noiseDb));
  assert.deepEqual(rankRoutes(demoRoutes, initialPreferences), before);
});

test('historical raw examples retain source units and do not attach to route geometry', () => {
  assert.equal(reference.noise.recordCount, 97);
  assert.equal(reference.crowds.recordCount, 142);
  assert.match(reference.purpose, /not associated/);
  for (const sample of reference.noise.examples) {
    const result = classifyNoise({ ...sample, source: sample.sourceUrl, quality: 'source-reported' }, now);
    assert.equal(result.value, sample.noiseDb);
    assert.match(result.reason, /not current or whole-route/);
    assert.equal('routeId' in sample, false);
  }
  const union = reference.crowds.examples.find(r => r.locationScope === 'multiple_counters')!;
  assert.equal(union.latitude, null);
  assert.equal(union.longitude, null);
  assert.ok(reference.crowds.examples.some(r => r.reportedCount === 0));
});

test('pros/cons disclose physical Unknown; missing indices never produce a sensory advantage', () => {
  const normal = routeTradeoffs(demoRoutes[0], demoRoutes, initialPreferences);
  assert.ok(normal.cons.some(text => text.includes('Physical conditions') && text.includes('Unknown')));
  const missing = { ...demoRoutes[0], noiseCost: NaN, crowdCost: NaN };
  const result = routeTradeoffs(missing, [missing], initialPreferences);
  assert.ok(result.cons.some(text => text.includes('Noise: Unknown')));
  assert.ok(result.cons.some(text => text.includes('Crowds: Unknown')));
  assert.ok(!result.pros.some(text => /Noise:|Crowds:/.test(text)));
});
