/** Administrative one-time seed of the reviewed cache. No online acquisition. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { solarGridObjects, validateSolarGrid } from '../lib/solar-grid-storage';

const bytes = await readFile(resolve('research/prediction/data/campus-grid.npz'));
validateSolarGrid(bytes);
const object = solarGridObjects()[0];
await object.save(bytes, {
  resumable: false, validation: 'crc32c',
  metadata: { contentType: 'application/octet-stream', cacheControl: 'public,max-age=31536000,immutable' },
});
const [stored] = await object.download();
validateSolarGrid(stored);
console.log(JSON.stringify({ uploaded: true, verified: true, bytes: stored.length, dataset: 'historical-uiuc-sunlight' }));
