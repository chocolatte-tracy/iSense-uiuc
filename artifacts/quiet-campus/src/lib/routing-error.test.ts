import test from 'node:test';
import assert from 'node:assert/strict';
import { routingFailureMessage } from './routing-error';

test('routing errors preserve both sanitized nested and flat adapter messages', () => {
  assert.equal(routingFailureMessage(429, { error: { code: 'BUDGET', message: 'Routing budget exhausted.' } }), 'Routing budget exhausted.');
  assert.equal(routingFailureMessage(403, { error: 'Campus coordinates are required.', code: 'INVALID_INPUT' }), 'Campus coordinates are required.');
});

test('unknown limit/service errors remain actionable without serializing payloads', () => {
  const unknown = { unexpected: 'not-for-display', error: { message: 42 } };
  assert.match(routingFailureMessage(429, unknown), /budget safeguards/);
  assert.match(routingFailureMessage(503, unknown), /currently unavailable/);
  assert.doesNotMatch(routingFailureMessage(null, unknown), /not-for-display|42/);
  assert.match(routingFailureMessage(null, null), /connection/);
});
