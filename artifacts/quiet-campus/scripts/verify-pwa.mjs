import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../dist/public');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.name, 'iSense');
assert.equal(manifest.short_name, 'iSense');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, manifest.scope);
assert.ok(manifest.scope.startsWith('/'));
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
for (const icon of manifest.icons) {
  assert.ok(icon.src.startsWith(manifest.scope));
  const bytes = await fs.readFile(path.join(root, icon.src.slice(manifest.scope.length)));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  const size = `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
  assert.equal(size, icon.sizes);
}
const apple = await fs.readFile(path.join(root, 'icons/apple-touch-icon.png'));
assert.equal(apple.readUInt32BE(16), 180);
assert.equal(apple.readUInt32BE(20), 180);
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
assert.ok(html.includes('manifest.webmanifest'));
assert.ok(html.includes('apple-touch-icon'));
assert.ok(html.includes('viewport-fit=cover'));
assert.ok(!html.includes('maximum-scale=1'));
const sw = await fs.readFile(path.join(root, 'sw.js'), 'utf8');
const precache = [...sw.matchAll(/\burl:\s*["']([^"']+)["']/g)].map(match => match[1]);
assert.ok(precache.length > 5, 'Production worker must precache actual app assets.');
assert.ok(precache.includes('index.html'));
for (const url of precache) {
  assert.ok(!/^(https?:|\/\/)/i.test(url), 'No external API/Maps asset in precache.');
  assert.ok(!/(^|\/)(?:api|\.env|node_modules)(\/|$)/i.test(url));
  assert.ok(/\.(?:html|js|css|png|svg|ico|woff2|webmanifest)$/.test(url));
  const content = await fs.readFile(path.join(root, url));
  // Do not print matches. Neither private credentials nor API responses belong in this cache.
  assert.ok(!/AIza[A-Za-z0-9_-]{35}/.test(content.toString()), 'A credential-like value was found in a cacheable asset.');
  assert.ok(!/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(content.toString()));
}
console.log(JSON.stringify({
  app: manifest.name, display: manifest.display, scope: manifest.scope,
  icons: manifest.icons.map(({ sizes, purpose }) => ({ sizes, purpose })),
  appleTouchIcon: '180x180', precachedStaticAssets: precache.length,
  externalAssetsInPrecache: 0, sensitiveCredentialPatterns: 0,
  note: 'No runtime API/Maps cache configured. Browser/offline tests are separate.',
}, null, 2));
