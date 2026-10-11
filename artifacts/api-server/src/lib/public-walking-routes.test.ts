import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createCampusRouteHandler } from '../routes/walking-routes';
import { RoutingError } from '@workspace/campus-routing/routing';

const origin = 'https://isense.example.test';
const input = { origin: { lat: 40.1094, lng: -88.2279 }, destination: { lat: 40.1121, lng: -88.2266 } };
async function fixture(t: test.TestContext, options: {
  enabled?: boolean; publicEnabled?: boolean; failBudget?: boolean;
  missingKey?: boolean; missingClientSecret?: boolean; dailyExhausted?: boolean; noRoutes?: boolean;
} = {}) {
  let calls = 0, reservations = 0;
  const app = express();
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', createCampusRouteHandler({
    clientSecret: options.missingClientSecret ? '' : 'synthetic-client-cookie-secret-at-least-32-characters',
    allowedOrigins: [origin], enabled: () => options.enabled !== false,
    publicEnabled: () => options.publicEnabled !== false, teamToken: 'synthetic-team-code-at-least-32-characters',
    budget: { reserve: async () => {
      reservations++;
      if (options.failBudget) throw new RoutingError('BUDGET_UNAVAILABLE', 'Persistent accounting unavailable.', 503);
      if (options.dailyExhausted) throw new RoutingError('DAILY_LIMIT', 'Daily quota is exhausted.', 429);
      return async () => {};
    } },
    clientOptions: { apiKey: options.missingKey ? '' : 'synthetic-public-test-key', fetchImpl: async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.travelMode, 'WALK');
      assert.equal(body.origin.location.latLng.latitude, input.origin.lat);
      return new Response(JSON.stringify({ routes: options.noRoutes ? [] : [{ duration: '525s', distanceMeters: 634,
        polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }, routeLabels: ['DEFAULT_ROUTE'] }] }));
    } },
  }));
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    post: (body: unknown = input, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}/api/walking-routes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'same-origin', ...headers },
      body: JSON.stringify(body),
    }),
    calls: () => calls, reservations: () => reservations,
  };
}
test('public opt-in uses the existing walking adapter without a code, after reserving budget', async t => {
  const app = await fixture(t);
  const response = await app.post();
  assert.equal(response.status, 200);
  assert.equal(app.calls(), 1); assert.equal(app.reservations(), 1);
  assert.ok(!(await response.text()).includes('synthetic-public-test-key'));
});
test('missing key/client configuration and exhausted daily quota block before Google; zero routes is honest', async t => {
  for (const [options, status, code] of [
    [{ missingKey: true }, 503, 'MISSING_API_KEY'],
    [{ missingClientSecret: true }, 503, 'CLIENT_SESSION_NOT_CONFIGURED'],
    [{ dailyExhausted: true }, 429, 'DAILY_LIMIT'],
  ] as const) {
    const app = await fixture(t, options);
    const response = await app.post();
    assert.equal(response.status, status);
    assert.equal((await response.json() as { error: { code: string } }).error.code, code);
    assert.equal(app.calls(), 0);
    if (code !== 'DAILY_LIMIT') assert.equal(app.reservations(), 0);
  }
  const app = await fixture(t, { noRoutes: true });
  const response = await app.post();
  assert.equal(response.status, 200);
  const body = await response.json() as { routes: unknown[]; routeCount: number };
  assert.deepEqual(body.routes, []);
  assert.equal(body.routeCount, 0);
  assert.equal(app.calls(), 1);
});
test('private/default mode, disabled Google approval and unavailable accounting fail closed', async t => {
  for (const [options, status] of [[{ publicEnabled: false }, 401], [{ enabled: false }, 503], [{ failBudget: true }, 503]] as const) {
    const app = await fixture(t, options);
    assert.equal((await app.post()).status, status);
    assert.equal(app.calls(), 0);
  }
});
test('public mode rejects bad origins, cross-site calls, free-text, outside/equal points and extra fields before billing', async t => {
  const app = await fixture(t);
  for (const [body, headers, status] of [
    [input, { Origin: 'https://outside.example.test' }, 403],
    [input, { Origin: '' }, 403],
    [input, { 'Sec-Fetch-Site': 'cross-site' }, 403],
    [{ ...input, origin: 'Main Quad' }, {}, 400],
    [{ ...input, origin: { lat: 0, lng: 0 } }, {}, 400],
    [{ ...input, destination: input.origin }, {}, 400],
    [{ ...input, ignoreLimits: true }, {}, 400],
  ] as const) assert.equal((await app.post(body, headers)).status, status);
  assert.equal(app.calls(), 0); assert.equal(app.reservations(), 0);
});
test('public peer request cap applies before a fourth cost reservation, even with spoofed forwarded IPs', async t => {
  const app = await fixture(t);
  for (let i = 0; i < 3; i++) assert.equal((await app.post(input, { 'X-Forwarded-For': `192.0.2.${i}` })).status, 200);
  const limited = await app.post(input, { 'X-Forwarded-For': '192.0.2.99' });
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(app.calls(), 3); assert.equal(app.reservations(), 3);
});
