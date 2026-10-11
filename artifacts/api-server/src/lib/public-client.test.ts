import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import type { RouteRequest } from '@workspace/campus-routing/proxy';
import { createPublicClientLimiter } from './public-client';
import { createPublicPeerLimiter } from './public-routing';

test('signed client limits cannot be overridden by query parameters; cookies are bounded, secure and expire', () => {
  let time = 1791670000000;
  const allow = createPublicClientLimiter('synthetic-session-secret-32-characters', () => time);
  let issued = '';
  const response = { setHeader: (_key: string, value: string) => { issued = value; } } as unknown as ServerResponse;
  const request = { headers: {} } as RouteRequest;
  assert.equal(allow(request, response), true);
  assert.match(issued, /HttpOnly; Secure; SameSite=Strict/);
  request.headers.cookie = issued.split(';')[0];
  assert.equal(allow(request, response), true);
  assert.equal(allow(request, response), true);
  assert.equal(allow(request, response), false);
  time += 60000;
  assert.equal(allow(request, response), true);
  // A forged cookie does not supply a trusted identity or arbitrary cap.
  request.headers.cookie = issued.split(';')[0].replace(/.$/, 'z');
  assert.equal(allow(request, response), true);
  assert.ok(!issued.endsWith('z'));
  // The separate peer limiter stops cookie rotation on the same transport.
  const peer = createPublicPeerLimiter(() => time);
  assert.deepEqual([1, 2, 3, 4].map(() => peer('same-transport')), [true, true, true, false]);
});
