import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createCampusRouteHandler } from '../routes/walking-routes';
import { FetchWalkingRoutesResponse } from '@workspace/api-zod';
import type { DurableBudget } from './routing-budget';
import { RoutingError } from '@workspace/campus-routing/routing';

const input = { origin: 'UIUC Main Quad', destination: 'UIUC Grainger Engineering Library' };
const allowedOrigin = 'https://isense.example.test';
const token = 'synthetic-team-code-at-least-32-characters';
const raw = { routes: [{ duration: '525s', distanceMeters: 634,
  polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }, routeLabels: ['DEFAULT_ROUTE'] }] };

async function fixture(t: test.TestContext, enabled: boolean, budget: DurableBudget = { reserve: async () => async () => {} }, upstreamStatus = 200) {
  let calls = 0;
  const app = express();
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', createCampusRouteHandler({
    enabled: () => enabled, allowedOrigins: [allowedOrigin],
    teamToken: token, budget,
    clientOptions: { apiKey: 'synthetic-test-key', fetchImpl: async (_url, options) => {
      calls++;
      const body = JSON.parse(String(options?.body));
      assert.equal(body.travelMode, 'WALK');
      assert.equal(body.computeAlternativeRoutes, true);
      assert.equal(body.origin.address, input.origin);
      return new Response(JSON.stringify(raw), { status: upstreamStatus });
    } },
  }));
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/api/walking-routes`;
  return {
    post: (body: unknown = input, origin = allowedOrigin, accessCode: string | null = token) => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin,
        ...(accessCode === null ? {} : { Authorization: `Bearer ${accessCode}` }) }, body: JSON.stringify(body),
    }),
    calls: () => calls,
  };
}

test('mounted POST adapter is disabled before approval; no Google call', async t => {
  const app = await fixture(t, false);
  const response = await app.post();
  assert.equal(response.status, 503);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, 'ROUTES_DISABLED');
  assert.equal(app.calls(), 0);
});

test('forged allowed Origin without team authorization cannot invoke Google or reserve money', async t => {
  let reservations = 0;
  const app = await fixture(t, true, { reserve: async () => { reservations++; return async () => {}; } });
  assert.equal((await app.post(input, allowedOrigin, null)).status, 401);
  assert.equal((await app.post(input, allowedOrigin, 'wrong-code')).status, 401);
  assert.equal((await app.post(input, allowedOrigin, 'x'.repeat(1100))).status, 401);
  assert.equal(reservations, 0);
  assert.equal(app.calls(), 0);
});

test('persistent budget failures are fail-closed with clear feedback and no Google call', async t => {
  for (const [code, status] of [['SPENDING_LIMIT', 429], ['BUDGET_UNAVAILABLE', 503]] as const) {
    const app = await fixture(t, true, { reserve: async () => { throw new RoutingError(code, 'Demo routes remain available.', status); } });
    const response = await app.post();
    assert.equal(response.status, status);
    assert.equal((await response.json() as { error: { code: string } }).error.code, code);
    assert.equal(app.calls(), 0);
  }
});

test('bad endpoint reserves nothing; upstream failures retain the reservation and release concurrency', async t => {
  let reserved = 0, released = 0;
  const app = await fixture(t, true, { reserve: async () => { reserved++; return async () => { released++; }; } }, 502);
  assert.equal((await app.post({ ...input, origin: '\u0000' })).status, 400);
  assert.equal(reserved, 0);
  assert.equal((await app.post()).status, 502);
  assert.equal(reserved, 1);
  assert.equal(released, 1);
  assert.equal(app.calls(), 1);
});

test('mounted POST adapter returns real-format duration, distance and decoded geometry using one mock', async t => {
  const app = await fixture(t, true);
  const response = await app.post();
  assert.equal(response.status, 200);
  const body = FetchWalkingRoutesResponse.parse(await response.json());
  assert.equal(body.routes[0].durationSeconds, 525);
  assert.equal(body.routes[0].distanceMeters, 634);
  assert.equal(body.routes[0].path.length, 3);
  assert.ok(!JSON.stringify(body).includes('synthetic-test-key'));
  assert.equal(app.calls(), 1);
});

test('bad origin, missing origin, malformed endpoints and extra fields never reach Google', async t => {
  const app = await fixture(t, true);
  assert.equal((await app.post(input, 'https://denied.example.test')).status, 403);
  assert.equal((await app.post(input, '')).status, 401);
  assert.equal((await app.post({ origin: '', destination: 'Grainger' })).status, 400);
  assert.equal((await app.post({ ...input, secret: 'must-not-forward' })).status, 400);
  assert.equal(app.calls(), 0);
});
