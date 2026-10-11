import test from 'node:test';
import assert from 'node:assert/strict';
import { installationEnvironment, canOfferInstallation } from './pwa-environment';
import { createPwaOptions } from '../../pwa.config';

const desktop = { userAgent: 'Chrome Windows', platform: 'Win32', maxTouchPoints: 0, displayStandalone: false, embedded: false };
test('installation instructions detect iPhone, Android and desktop-mode iPad', () => {
  assert.ok(installationEnvironment({ ...desktop, userAgent: 'iPhone Safari' }).ios);
  assert.ok(installationEnvironment({ ...desktop, userAgent: 'Android Chrome' }).android);
  assert.ok(installationEnvironment({ ...desktop, platform: 'MacIntel', maxTouchPoints: 5 }).ios);
  assert.equal(installationEnvironment(desktop).ios, false);
  assert.ok(installationEnvironment({ ...desktop, appleStandalone: true }).installed);
  assert.ok(installationEnvironment({ ...desktop, displayStandalone: true }).installed);
});
test('installation is never a dead button on unsupported, embedded or installed browsers', () => {
  assert.equal(canOfferInstallation(installationEnvironment(desktop), false), false);
  assert.equal(canOfferInstallation(installationEnvironment({ ...desktop, embedded: true }), true), false);
  assert.equal(canOfferInstallation(installationEnvironment({ ...desktop, displayStandalone: true }), true), false);
  assert.equal(canOfferInstallation(installationEnvironment(desktop), true), true);
});
test('PWA entry points and icons stay within artifact paths; updates are not forced', () => {
  for (const base of ['/', '/isense/']) {
    const options = createPwaOptions(base);
    const manifest = options.manifest;
    assert.ok(manifest && typeof manifest !== 'boolean');
    assert.equal(manifest.name, 'iSense');
    assert.equal(manifest.short_name, 'iSense');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.orientation, 'any');
    assert.equal(manifest.scope, base);
    assert.equal(manifest.start_url, base);
    assert.ok(manifest.icons?.some(icon => icon.purpose === 'maskable'));
    assert.ok(manifest.icons?.every(icon => icon.src.startsWith(base)));
    assert.equal(options.registerType, 'prompt');
    assert.equal(options.injectRegister, null);
    assert.equal(options.workbox?.skipWaiting, false);
    assert.deepEqual(options.workbox?.runtimeCaching, []);
    const allow = options.workbox?.navigateFallbackAllowlist?.[0];
    assert.ok(allow?.test(base));
    assert.ok(allow?.test(`${base}?preview=demo`));
    assert.ok(allow?.test(`${base}index.html`));
    assert.equal(allow?.test(`${base}api/campus-routes`), false);
    assert.equal(allow?.test('/mockup-sandbox/'), false);
  }
  assert.throws(() => createPwaOptions('https://example.com/'));
  assert.throws(() => createPwaOptions('/../'));
  assert.throws(() => createPwaOptions('//evil/'));
});
