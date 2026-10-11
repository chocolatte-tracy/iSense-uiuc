import { unzipSync } from 'fflate';

export const SOLAR_GRID_HASH = '109eca2ad7406836a932d1d50297488ae60491a69efa4e099c08d6f4fd38b902';
export const gridMetadata = {
  xmin: 394812, ymin: 4439966, xmax: 396012, ymax: 4441166,
  width: 600, height: 600, crs: 'EPSG:32616', verticalUnit: 'm',
  collectionStart: '2019-11-23', collectionEnd: '2020-03-08',
};

/** Restricted decoder for the reviewed little-endian, C-order float64 cache. */
function decodeNpy(bytes: Uint8Array): Float64Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(1, 6)) !== 'NUMPY' || bytes[0] !== 147 || bytes[6] !== 1)
    throw new Error('Unsupported model array.');
  const offset = 10 + view.getUint16(8, true);
  const header = new TextDecoder().decode(bytes.subarray(10, offset));
  if (!header.includes("'<f8'") || !/['"]fortran_order['"]:\s*False/.test(header)
    || !/['"]shape['"]:\s*\(600,\s*600\)/.test(header) || bytes.length - offset !== 600 * 600 * 8)
    throw new Error('Unexpected model dimensions or units.');
  // Copy preserves IEEE float64 values and removes any byte-alignment issue.
  const result = new Float64Array(600 * 600);
  for (let i = 0; i < result.length; i++) result[i] = view.getFloat64(offset + i * 8, true);
  return result;
}

export async function loadBrowserGrid(bytes: ArrayBuffer) {
  if (bytes.byteLength > 6 * 1024 * 1024) throw new Error('Model exceeds the supported size.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
  if (hash !== SOLAR_GRID_HASH) throw new Error('Terrain cache integrity check failed.');
  const files = unzipSync(new Uint8Array(bytes));
  if (!files['dsm.npy'] || !files['dtm.npy']) throw new Error('Terrain arrays missing.');
  return { dsm: decodeNpy(files['dsm.npy']), dtm: decodeNpy(files['dtm.npy']), ...gridMetadata };
}
export type SolarGrid = Awaited<ReturnType<typeof loadBrowserGrid>>;
