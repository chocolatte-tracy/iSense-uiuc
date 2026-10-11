import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPublicMapsConfig } from './google-routes.mjs';

test('Maps requires an exact true switch; absent flags stay disabled despite a browser key', () => {
  process.env.VITE_GOOGLE_MAPS_API_KEY = 'synthetic-browser';
  delete process.env.GOOGLE_MAPS_BROWSER_API_KEY;
  process.env.GOOGLE_ROUTES_API_ENABLED = 'false';
  process.env.GOOGLE_PLACES_API_ENABLED = 'false';
  for (const flag of [undefined, '', 'false', 'True', '1']) {
    if (flag === undefined) delete process.env.GOOGLE_MAPS_API_ENABLED;
    else process.env.GOOGLE_MAPS_API_ENABLED = flag;
    const c = getPublicMapsConfig();
    assert.equal(c.enabled, false);
    assert.equal(c.mapStatus, 'MAPS_DISABLED');
    assert.equal(c.browserKeyPresent, true);
    assert.equal(c.browserApiKey, undefined);
    assert.match(c.message, /GOOGLE_MAPS_API_ENABLED/);
    if (flag === undefined) assert.match(c.message, /not configured/);
  }
  process.env.GOOGLE_MAPS_API_ENABLED = 'true';
  const ready = getPublicMapsConfig();
  assert.equal(ready.enabled, true);
  assert.equal(ready.mapStatus, 'READY_UNVERIFIED');
  assert.equal(ready.routesEnabled, false);
  assert.equal(ready.placesEnabled, false);
  delete process.env.VITE_GOOGLE_MAPS_API_KEY;
  assert.equal(getPublicMapsConfig().mapStatus, 'BROWSER_KEY_MISSING');
});

test('config distinguishes flags from missing keys and preserves independent Maps/Places/Routes consent', () => {
  for (const key of ['VITE_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_BROWSER_API_KEY', 'GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_ROUTES_API_KEY']) delete process.env[key];
  process.env.GOOGLE_MAPS_API_ENABLED = 'false';
  process.env.GOOGLE_PLACES_API_ENABLED = 'false';
  process.env.GOOGLE_ROUTES_API_ENABLED = 'false';
  let c = getPublicMapsConfig();
  assert.equal(c.mapStatus, 'MAPS_DISABLED'); assert.equal(c.placesStatus, 'PLACES_DISABLED'); assert.equal(c.routingStatus, 'ROUTES_DISABLED');
  process.env.GOOGLE_MAPS_API_ENABLED = 'true'; process.env.GOOGLE_PLACES_API_ENABLED = 'true'; process.env.GOOGLE_ROUTES_API_ENABLED = 'true';
  c = getPublicMapsConfig();
  assert.equal(c.mapStatus, 'BROWSER_KEY_MISSING'); assert.equal(c.routingStatus, 'MISSING_API_KEY');
  process.env.VITE_GOOGLE_MAPS_API_KEY = 'synthetic-browser';
  process.env.GOOGLE_ROUTES_API_KEY = 'synthetic-private-server';
  process.env.GOOGLE_MAPS_API_ENABLED = 'false'; process.env.GOOGLE_ROUTES_API_ENABLED = 'false';
  c = getPublicMapsConfig();
  assert.equal(c.enabled, false); assert.equal(c.placesEnabled, true);
  assert.equal(c.browserApiKey, 'synthetic-browser');
  assert.equal(c.routesEnabled, false);
  assert.ok(!JSON.stringify(c).includes('synthetic-private-server'));
  process.env.GOOGLE_PLACES_API_ENABLED = 'false';
  assert.equal(getPublicMapsConfig().browserApiKey, undefined);
  process.env.GOOGLE_ROUTES_API_ENABLED = 'true';
  process.env.GOOGLE_ROUTES_PUBLIC_ENABLED = 'true';
  process.env.ROUTING_REQUEST_RESERVE_CENTS = '5';
  process.env.SESSION_SECRET = '';
  assert.equal(getPublicMapsConfig().routingStatus, 'CLIENT_SESSION_NOT_CONFIGURED');
});
