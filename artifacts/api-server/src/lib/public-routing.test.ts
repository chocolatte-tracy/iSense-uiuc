import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicCampusTrip, createPublicPeerLimiter } from './public-routing';

const input = { origin: { lat: 40.1094, lng: -88.2279 }, destination: { lat: 40.1121, lng: -88.2266 } };
test('public walking area accepts distinct UIUC coordinates but not addresses, equal or outside points', () => {
  assert.equal(isPublicCampusTrip(input), true);
  assert.equal(isPublicCampusTrip({ ...input, origin: 'Main Quad' }), false);
  assert.equal(isPublicCampusTrip({ ...input, destination: input.origin }), false);
  assert.equal(isPublicCampusTrip({ ...input, origin: { lat: 39, lng: -88.2 } }), false);
  assert.equal(isPublicCampusTrip({ ...input, origin: { lat: Number.NaN, lng: -88.2 } }), false);
});
test('public peer limiter caps a minute, allows a later window and bounds stored peers', () => {
  let time = 0;
  const allow = createPublicPeerLimiter(() => time, 3, 2);
  assert.equal(allow('peer-a'), true); assert.equal(allow('peer-a'), true); assert.equal(allow('peer-a'), true);
  assert.equal(allow('peer-a'), false);
  assert.equal(allow('peer-b'), true); assert.equal(allow('peer-c'), false);
  time = 60000;
  assert.equal(allow('peer-a'), true); assert.equal(allow('peer-c'), true);
});
