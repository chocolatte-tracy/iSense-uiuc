import { Storage } from '@google-cloud/storage';
import { createHash } from 'node:crypto';

export const SOLAR_GRID_HASH = '109eca2ad7406836a932d1d50297488ae60491a69efa4e099c08d6f4fd38b902';
const objectName = `models/isense/sunlight/${SOLAR_GRID_HASH}.npz`;
// Replit-managed App Storage authentication, not a Google Maps credential.
const sidecar = 'http://127.0.0.1:1106';
export const solarStorage = new Storage({
  projectId: '',
  credentials: {
    type: 'external_account', audience: 'replit', subject_token_type: 'access_token',
    token_url: `${sidecar}/token`, universe_domain: 'googleapis.com',
    credential_source: { url: `${sidecar}/credential`, format: { type: 'json', subject_token_field_name: 'access_token' } },
  },
});

export function solarGridObjects() {
  const paths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? '').split(',').map(p => p.trim()).filter(Boolean);
  if (!paths.length) throw new Error('MODEL_STORAGE_NOT_CONFIGURED');
  return paths.map(path => {
    const match = /^\/([^/]+)\/(.+)$/.exec(path);
    if (!match) throw new Error('MODEL_STORAGE_NOT_CONFIGURED');
    return solarStorage.bucket(match[1]).file(`${match[2].replace(/\/$/, '')}/${objectName}`);
  });
}

export function validateSolarGrid(bytes: Buffer) {
  if (bytes.length > 6 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== SOLAR_GRID_HASH)
    throw new Error('MODEL_CACHE_INVALID');
}

let cached: Promise<Buffer> | undefined;
export function getSolarGrid(): Promise<Buffer> {
  if (!cached) cached = (async () => {
    for (const object of solarGridObjects()) {
      try {
        const [bytes] = await object.download();
        validateSolarGrid(bytes);
        return bytes;
      } catch { /* Try only the configured public directories; no user paths. */ }
    }
    throw new Error('MODEL_ASSET_UNAVAILABLE');
  })().catch(error => { cached = undefined; throw error; });
  return cached;
}
