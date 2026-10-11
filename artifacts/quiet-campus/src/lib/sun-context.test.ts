import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSunContext, nextSunRefreshDelay, solarPreviewTime, sunClockLabel } from './sun-context';
import { applySunContext, effectivePreferenceWeights, initialPreferences, rankRoutes, type PreferenceWeights } from './route-scoring';
import { demoRoutes } from './demo-routes';
import { routeTradeoffs } from './route-tradeoffs';
import { encodeSavedPreferences } from './app-state';

const day = calculateSunContext(new Date('2026-10-10T17:00:00Z'));
const night = calculateSunContext(new Date('2026-10-10T05:00:00Z'));

for (const [label, instant, expected] of [
  ['one minute before sunrise', day.sunrise!.getTime() - 60_000, 'nighttime'],
  ['exactly at sunrise', day.sunrise!.getTime(), 'daytime'],
  ['midday', Date.parse('2026-10-10T17:00:00Z'), 'daytime'],
  ['one minute before sunset', day.sunset!.getTime() - 60_000, 'daytime'],
  ['exactly at sunset', day.sunset!.getTime(), 'nighttime'],
  ['Illinois midnight', Date.parse('2026-10-10T05:00:00Z'), 'nighttime'],
] as const) {
  test(`sun context: ${label}`, () => {
    const result = calculateSunContext(new Date(instant));
    assert.equal(result.phase, expected);
    assert.equal(result.localDate, '2026-10-10');
    assert.equal(result.timeZone, 'America/Chicago');
  });
}

test('sunrise/sunset vary by season and coordinates, not fixed clock hours', () => {
  const summer = calculateSunContext(new Date('2026-06-21T17:00:00Z'));
  const winter = calculateSunContext(new Date('2026-12-21T18:00:00Z'));
  const daylight = (value: typeof day) => value.sunset!.getTime() - value.sunrise!.getTime();
  assert.ok(daylight(summer) > 14 * 3_600_000);
  assert.ok(daylight(winter) < 10 * 3_600_000);
  // Sanity bounds for the library's UIUC October result, not hardcoded events.
  assert.ok(day.sunrise!.getTime() > Date.parse('2026-10-10T11:50:00Z'));
  assert.ok(day.sunrise!.getTime() < Date.parse('2026-10-10T12:10:00Z'));
  const moved = calculateSunContext(day.departureTime, { latitude: 40.13, longitude: -88.205 });
  assert.notEqual(moved.sunrise!.getTime(), day.sunrise!.getTime());
});

test('DST spring gap and repeated autumn hour keep the correct Illinois date and solar interval', () => {
  for (const [before, after, expectedDate] of [
    ['2026-03-08T07:59:00Z', '2026-03-08T08:01:00Z', '2026-03-08'],
    ['2026-11-01T06:30:00Z', '2026-11-01T07:30:00Z', '2026-11-01'],
  ]) {
    const a = calculateSunContext(new Date(before));
    const b = calculateSunContext(new Date(after));
    assert.equal(a.localDate, expectedDate);
    assert.equal(b.localDate, expectedDate);
    assert.equal(a.sunrise!.getTime(), b.sunrise!.getTime());
    assert.equal(a.sunset!.getTime(), b.sunset!.getTime());
    assert.equal(a.phase, 'nighttime');
    assert.equal(b.phase, 'nighttime');
  }
  assert.match(sunClockLabel(new Date('2026-03-08T07:59:00Z')), /CST/);
  assert.match(sunClockLabel(new Date('2026-03-08T08:01:00Z')), /CDT/);
  assert.match(sunClockLabel(new Date('2026-11-01T06:30:00Z')), /CDT/);
  assert.match(sunClockLabel(new Date('2026-11-01T07:30:00Z')), /CST/);
});

test('visitors in another timezone use UIUC local date, not UTC or device date', () => {
  const prior = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Tokyo';
    const fromTokyo = calculateSunContext(new Date('2026-10-11T12:00:00+09:00'));
    process.env.TZ = 'Pacific/Honolulu';
    const fromHawaii = calculateSunContext(new Date('2026-10-10T17:00:00-10:00'));
    assert.equal(fromTokyo.localDate, '2026-10-10');
    assert.equal(fromTokyo.phase, 'nighttime');
    assert.equal(fromTokyo.sunrise!.getTime(), fromHawaii.sunrise!.getTime());
    assert.equal(fromTokyo.sunset!.getTime(), fromHawaii.sunset!.getTime());
    assert.equal(fromTokyo.phase, fromHawaii.phase);
  } finally {
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
  }
});

test('night zeros direct sunlight and excludes Sun from denominator, without mutating saved settings or source', () => {
  const preferences = Object.freeze({ ...initialPreferences });
  const original = structuredClone(demoRoutes);
  const saved = encodeSavedPreferences({ preferences, lockedWeights: ['preferShade'] });
  const scored = rankRoutes(demoRoutes, preferences, night);
  assert.ok(scored.length > 0);
  assert.ok(scored.every(route => route.sunExposureCost === 0 && route.directSunlightExcluded));
  assert.equal(effectivePreferenceWeights(preferences, night).preferShade, 0);
  assert.equal(preferences.preferShade, 20);
  assert.equal(preferences.sunAcceptance, 'medium');
  assert.deepEqual(demoRoutes, original);
  assert.equal(encodeSavedPreferences({ preferences, lockedWeights: ['preferShade'] }), saved);
  assert.deepEqual(rankRoutes(demoRoutes, preferences, day), rankRoutes(demoRoutes, preferences));
  for (const route of scored) {
    assert.equal(applySunContext(route, day).sunExposureCost,
      demoRoutes.find(originalRoute => originalRoute.id === route.id)!.sunExposureCost);
  }
  const noSun = { ...preferences, preferShade: 0 };
  const baseline = rankRoutes(demoRoutes.map(route => ({ ...route, sunExposureCost: 0 })), noSun);
  assert.deepEqual(scored.map(route => [route.id, route.score]), baseline.map(route => [route.id, route.score]));
});

test('night Sun Acceptance uses zero exposure; Noise/Crowd acceptance and hard walking cap remain active', () => {
  const sample = { ...demoRoutes[0], noiseCost: 10, crowdCost: 10, sunExposureCost: 90 };
  const preferences = { ...initialPreferences, sunAcceptance: 'low' as const };
  assert.equal(rankRoutes([sample], preferences, day)[0].meetsAcceptance, false);
  assert.equal(rankRoutes([sample], preferences, night)[0].meetsAcceptance, true);
  const noisy = { ...sample, noiseCost: 90 };
  assert.equal(rankRoutes([noisy], { ...preferences, noiseAcceptance: 'low' }, night)[0].meetsAcceptance, false);
  const crowded = { ...sample, crowdCost: 90 };
  assert.equal(rankRoutes([crowded], { ...preferences, crowdAcceptance: 'low' }, night)[0].meetsAcceptance, false);
  const routes = rankRoutes(demoRoutes, { ...preferences, maxExtraWalkingMinutes: 0 }, night);
  assert.ok(routes.every(route => route.walkingTimeMinutes === 9));
  assert.ok(!routes.some(route => route.id === 'route-c'));
});

test('all effective weights zero safely preserve fastest-only fallback and existing tie order', () => {
  const sunOnly: PreferenceWeights = { ...initialPreferences,
    avoidNoise: 0, avoidCrowds: 0, preferShade: 100, prioritizeShortWalkingTime: 0,
    noiseAcceptance: 'high', crowdAcceptance: 'high', sunAcceptance: 'high' };
  const allZero = { ...sunOnly, preferShade: 0 };
  const reverse = [...demoRoutes].reverse();
  const actual = rankRoutes(reverse, sunOnly, night);
  const expected = rankRoutes(reverse, allZero);
  assert.deepEqual(actual.map(route => [route.id, route.score]), expected.map(route => [route.id, route.score]));
  assert.ok(actual.every(route => Number.isFinite(route.score)));
  assert.equal(actual[0].walkingTimeMinutes, 9);
  assert.equal(actual[0].id, 'route-b');
  assert.deepEqual(rankRoutes(reverse, allZero, day), expected);
});

test('day/night context changes rerank locally and restore the original daytime ranking', () => {
  const base = demoRoutes[0];
  const routes = [
    { ...base, id: 'shade', noiseCost: 80, crowdCost: 10, sunExposureCost: 0 },
    { ...base, id: 'quiet', noiseCost: 0, crowdCost: 10, sunExposureCost: 100 },
  ];
  const preferences = { ...initialPreferences, avoidNoise: 10, avoidCrowds: 0,
    preferShade: 90, prioritizeShortWalkingTime: 0, noiseAcceptance: 'high' as const, sunAcceptance: 'high' as const };
  assert.equal(rankRoutes(routes, preferences, day)[0].id, 'shade');
  assert.equal(rankRoutes(routes, preferences, night)[0].id, 'quiet');
  assert.equal(rankRoutes(routes, preferences, day)[0].id, 'shade');
  const adjusted = applySunContext(routes[0], night);
  const tradeoffs = routeTradeoffs(adjusted, routes.map(route => applySunContext(route, night)), preferences);
  assert.ok(![...tradeoffs.pros, ...tradeoffs.cons].some(text => text.includes('Sun')));
});

test('dev-only explicit-instant preview cannot override production or persist as a preference', () => {
  const query = '?preview=demo&solarTime=2026-10-10T17%3A00%3A00Z';
  assert.equal(solarPreviewTime(query, true)!.toISOString(), '2026-10-10T17:00:00.000Z');
  assert.equal(solarPreviewTime(query, false), null);
  assert.equal(solarPreviewTime('?solarTime=2026-10-10T17:00:00Z', true), null);
  assert.equal(solarPreviewTime('?preview=demo&solarTime=2026-10-10T12:00:00', true), null);
  assert.equal(solarPreviewTime('?preview=demo&solarTime=invalid', true), null);
});

test('refresh timer targets solar boundaries; missing/invalid solar data is explicit, never assumed night', () => {
  assert.equal(nextSunRefreshDelay(day, day.sunrise!.getTime() - 500), 500);
  assert.equal(nextSunRefreshDelay(day, day.sunset!.getTime() - 1), 1);
  assert.equal(nextSunRefreshDelay(day, day.departureTime.getTime()), 30_000);
  const invalid = calculateSunContext(new Date(NaN));
  assert.equal(invalid.phase, 'unavailable');
  assert.equal(calculateSunContext(day.departureTime, { latitude: NaN, longitude: 0 }).phase, 'unavailable');
  assert.equal(calculateSunContext(day.departureTime, { latitude: 90, longitude: 0 }).phase, 'unavailable');
  assert.deepEqual(rankRoutes(demoRoutes, initialPreferences, invalid), rankRoutes(demoRoutes, initialPreferences));
});
