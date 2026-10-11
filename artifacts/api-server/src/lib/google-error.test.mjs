import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWalkingRoutes } from '../../../../lib/campus-routing/server/google-routes.js';

test('upstream key/API/restrictions/billing/quota failures remain distinct, with no sensitive response echoed', async () => {
  const cases = [
    ['API_KEY_INVALID', 'GOOGLE_INVALID_KEY'],
    ['SERVICE_DISABLED', 'GOOGLE_API_DISABLED'],
    ['API_KEY_SERVICE_BLOCKED', 'GOOGLE_KEY_RESTRICTION'],
    ['API_KEY_IP_ADDRESS_BLOCKED', 'GOOGLE_KEY_RESTRICTION'],
    ['BILLING_DISABLED', 'GOOGLE_BILLING_DISABLED'],
    ['QUOTA_EXCEEDED', 'GOOGLE_QUOTA_EXCEEDED'],
  ];
  for (const [reason, code] of cases) {
    let calls = 0;
    await assert.rejects(computeWalkingRoutes({ origin: { lat: 40.1075, lng: -88.2272 }, destination: { lat: 40.1125, lng: -88.2269 } }, {
      apiKey: 'synthetic-key', fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ error: { message: 'sensitive-upstream-value', details: [{ reason, metadata: { credential: 'sensitive-upstream-value' } }] } }), { status: 403 });
      },
    }), error => {
      assert.equal(error.code, code);
      assert.ok(!String(error).includes('sensitive-upstream-value'));
      return true;
    });
    assert.equal(calls, 1);
  }
});
