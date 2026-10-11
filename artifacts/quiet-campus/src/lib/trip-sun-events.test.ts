import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSunContext, estimateTripSunEvents, sunTripTimeLabel } from './sun-context';
import { demoRoutes } from './demo-routes';
import { initialPreferences, rankRoutes } from './route-scoring';

const day = calculateSunContext(new Date('2026-10-10T17:00:00Z'));
const estimateWalk = (departure: Date, durationSeconds: number) => {
  const result = estimateTripSunEvents({ durationSeconds }, calculateSunContext(departure));
  assert.equal(result.status, 'available');
  if (result.status !== 'available') throw new Error('Expected a usable estimate');
  return result;
};

for (const kind of ['sunrise', 'sunset'] as const) {
  const time = day[kind]!;
  test(`a walk crossing ${kind} reports the local astronomical event`, () => {
    const result = estimateWalk(new Date(time.getTime() - 300_000), 600);
    assert.deepEqual(result.events, [{ kind, time }]);
    assert.equal(result.arrivalTime.getTime() - result.departureTime.getTime(), 600_000);
    assert.match(sunTripTimeLabel(result.events[0].time), /Oct 10, 2026.*CDT/);
  });

  test(`${kind} boundaries use exact instants: arrival included, departure excluded`, () => {
    const departure = new Date(time.getTime() - 300_000);
    assert.deepEqual(estimateWalk(departure, 300).events, [{ kind, time }]);
    assert.deepEqual(estimateWalk(departure, 299.999).events, []);
    assert.deepEqual(estimateWalk(time, 60).events, []);
    assert.deepEqual(estimateWalk(new Date(time.getTime() + 1), 60).events, []);
  });
}

test('no event is predicted for ordinary daytime/nighttime walks or merely crossing midnight', () => {
  for (const departure of [
    '2026-10-10T12:00:00-05:00', '2026-10-10T21:00:00-05:00', '2026-10-10T23:55:00-05:00',
  ]) assert.deepEqual(estimateWalk(new Date(departure), 20 * 60).events, []);
  const midnight = estimateWalk(new Date('2026-10-10T23:55:00-05:00'), 20 * 60);
  assert.match(sunTripTimeLabel(midnight.departureTime), /Oct 10, 2026/);
  assert.match(sunTripTimeLabel(midnight.arrivalTime), /Oct 11, 2026/);
});

test('overnight walks use the next local day’s sunrise across midnight, month and year boundaries', () => {
  for (const [departure, nextDay] of [
    ['2026-10-10T23:55:00-05:00', '2026-10-11T18:00:00Z'],
    ['2026-09-30T23:55:00-05:00', '2026-10-01T18:00:00Z'],
    ['2026-12-31T23:55:00-06:00', '2027-01-01T18:00:00Z'],
  ]) {
    const result = estimateWalk(new Date(departure), 8 * 3600);
    const sunrise = calculateSunContext(new Date(nextDay)).sunrise!;
    assert.deepEqual(result.events, [{ kind: 'sunrise', time: sunrise }]);
    assert.ok(sunrise > result.departureTime && sunrise <= result.arrivalTime);
  }
});

test('DST gap and repeated hour add elapsed seconds, not wall-clock minutes', () => {
  for (const [departure, arrival, departureOffset, arrivalOffset] of [
    ['2026-03-08T01:55:00-06:00', '2026-03-08T03:05:00-05:00', 'CST', 'CDT'],
    ['2026-11-01T01:55:00-05:00', '2026-11-01T01:05:00-06:00', 'CDT', 'CST'],
  ]) {
    const result = estimateWalk(new Date(departure), 600);
    assert.equal(result.arrivalTime.toISOString(), new Date(arrival).toISOString());
    assert.match(sunTripTimeLabel(result.departureTime), new RegExp(departureOffset));
    assert.match(sunTripTimeLabel(result.arrivalTime), new RegExp(arrivalOffset));
    assert.deepEqual(result.events, []);
  }
});

test('overnight walks crossing DST find the actual following sunrise without duplicating events', () => {
  for (const [departure, nextDay, hours, expectedOffset] of [
    ['2026-03-07T23:45:00-06:00', '2026-03-08T18:00:00Z', 8.5, 'CDT'],
    ['2026-10-31T23:45:00-05:00', '2026-11-01T18:00:00Z', 9, 'CST'],
  ] as const) {
    const result = estimateWalk(new Date(departure), hours * 3600);
    const sunrise = calculateSunContext(new Date(nextDay)).sunrise!;
    assert.deepEqual(result.events, [{ kind: 'sunrise', time: sunrise }]);
    assert.match(sunTripTimeLabel(sunrise), new RegExp(expectedOffset));
  }
});

test('multi-day walks include every event once, in chronological order', () => {
  const result = estimateWalk(new Date('2026-10-10T23:00:00-05:00'), 48 * 3600);
  const next = calculateSunContext(new Date('2026-10-11T18:00:00Z'));
  const last = calculateSunContext(new Date('2026-10-12T18:00:00Z'));
  assert.deepEqual(result.events, [
    { kind: 'sunrise', time: next.sunrise }, { kind: 'sunset', time: next.sunset },
    { kind: 'sunrise', time: last.sunrise }, { kind: 'sunset', time: last.sunset },
  ]);
});

test('valid durationSeconds takes precedence; invalid/missing seconds fall back to walkingTimeMinutes', () => {
  const context = calculateSunContext(new Date(day.sunset!.getTime() - 300_000));
  const short = estimateTripSunEvents({ durationSeconds: 60, walkingTimeMinutes: 10 }, context);
  assert.equal(short.status, 'available');
  if (short.status === 'available') assert.deepEqual(short.events, []);
  for (const durationSeconds of [undefined, NaN, Infinity, -60, 0]) {
    const fallback = estimateTripSunEvents({ durationSeconds, walkingTimeMinutes: 5.5 }, context);
    assert.equal(fallback.status, 'available');
    if (fallback.status === 'available') {
      assert.equal(fallback.arrivalTime.getTime() - context.departureTime.getTime(), 330_000);
      assert.deepEqual(fallback.events, [{ kind: 'sunset', time: day.sunset }]);
    }
  }
});

test('missing/invalid input yields unavailable, never a false no-crossing assurance', () => {
  assert.deepEqual(estimateTripSunEvents({ durationSeconds: 60 }), { status: 'unavailable', reason: 'departure' });
  assert.deepEqual(estimateTripSunEvents({ durationSeconds: 60 }, calculateSunContext(new Date(NaN))),
    { status: 'unavailable', reason: 'departure' });
  for (const walkingTimeMinutes of [undefined, NaN, Infinity, 0, -1, Number.MAX_VALUE]) {
    assert.deepEqual(estimateTripSunEvents({ walkingTimeMinutes }, day), { status: 'unavailable', reason: 'duration' });
  }
  assert.deepEqual(estimateTripSunEvents({ durationSeconds: 367 * 86400 }, day),
    { status: 'unavailable', reason: 'duration' });
  for (const latitude of [NaN, 91, 90]) {
    assert.deepEqual(estimateTripSunEvents({ durationSeconds: 60 },
      calculateSunContext(day.departureTime, { latitude, longitude: 0 })),
    { status: 'unavailable', reason: 'solar' });
  }
});

test('device timezones do not change UIUC dates, labels or trip solar events; origin coordinates are used', () => {
  const prior = process.env.TZ;
  const context = calculateSunContext(new Date('2026-10-10T23:55:00-05:00'), { latitude: 40.13, longitude: -88.205 });
  try {
    process.env.TZ = 'Asia/Tokyo';
    const a = estimateTripSunEvents({ walkingTimeMinutes: 480 }, context);
    process.env.TZ = 'Pacific/Honolulu';
    const b = estimateTripSunEvents({ walkingTimeMinutes: 480 }, context);
    assert.deepEqual(a, b);
    assert.equal(a.status, 'available');
    if (a.status === 'available') {
      const expected = calculateSunContext(new Date('2026-10-11T18:00:00Z'), context.location).sunrise!;
      assert.deepEqual(a.events, [{ kind: 'sunrise', time: expected }]);
      assert.match(sunTripTimeLabel(a.events[0].time), /Oct 11, 2026.*CDT/);
    }
  } finally {
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
  }
});

test('crossing estimates leave departure-time scores, ranking, source data and saved preferences unchanged', () => {
  for (const time of [day.sunrise!, day.sunset!]) {
    const context = calculateSunContext(new Date(time.getTime() - 300_000));
    const preferences = Object.freeze({ ...initialPreferences });
    const before = structuredClone({ context, routes: demoRoutes, preferences });
    const baseline = rankRoutes(demoRoutes, preferences, context);
    for (const route of demoRoutes) {
      const estimate = estimateTripSunEvents(route, context);
      assert.equal(estimate.status, 'available');
      if (estimate.status === 'available') assert.equal(estimate.events.length, 1);
    }
    assert.deepEqual(rankRoutes(demoRoutes, preferences, context), baseline);
    assert.deepEqual({ context, routes: demoRoutes, preferences }, before);
  }
});
