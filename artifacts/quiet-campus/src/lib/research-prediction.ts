/** Offline research only. No conversion to sensory evidence or ranking costs. */
import { z } from 'zod';
import type { DemoRoute } from './route-scoring';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime();
export const bindingSchema = z.object({
  geometrySha256: hash, durationMilliseconds: z.number().int().positive().max(86400000),
  departureAt: instant, requestSha256: hash,
}).strict();
export type PredictionBinding = z.infer<typeof bindingSchema>;

async function sha256(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, '0')).join('');
}

/** Provider IDs can be reused. Shape and exact duration identify a route snapshot. */
export function routeSnapshotKey(route: DemoRoute): string {
  return JSON.stringify([route.source, route.durationSeconds, route.coordinates]);
}

export async function exportPredictionRoutes(routes: DemoRoute[], departure: Date) {
  if (!Number.isFinite(departure.getTime())) throw new Error('A valid departure time is required.');
  if (!routes.length || routes.length > 8) throw new Error('Export one to eight routes.');
  const departureAt = departure.toISOString();
  const exported = await Promise.all(routes.map(async route => {
    if (route.source !== 'google') throw new Error('Only a full Google route can be exported. Demo paths are not supported.');
    if (!route.id.trim()) throw new Error('A route ID is required.');
    const seconds = route.durationSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86400)
      throw new Error('Exact route duration in seconds is required.');
    if (route.coordinates.length < 2 || route.coordinates.length > 10000)
      throw new Error('A complete route with 2–10,000 vertices is required.');
    // App coordinates are [latitude, longitude]; GeoJSON is [longitude, latitude].
    const coordinates = route.coordinates.map(([lat, lon]) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 40.05 || lat > 40.17 || lon < -88.3 || lon > -88.15)
        throw new Error('This offline model only supports the UIUC area.');
      return [lon, lat] as [number, number];
    });
    const geometrySha256 = await sha256(coordinates.map(p => p.map(x => Math.round(x * 1e7)).join(',')).join(';'));
    const durationMilliseconds = Math.round(seconds * 1000);
    if (!durationMilliseconds) throw new Error('Route duration is too short.');
    const requestSha256 = await sha256(`isense-research-1\n${geometrySha256}\n${durationMilliseconds}\n${departureAt}`);
    return {
      id: route.id, source: 'google' as const, geometryStatus: 'complete_verified' as const,
      crs: 'EPSG:4326' as const, coordinateOrder: 'longitude,latitude' as const,
      durationSeconds: durationMilliseconds / 1000, durationMinutes: durationMilliseconds / 60000,
      geometry: { type: 'LineString' as const, coordinates },
      binding: { geometrySha256, durationMilliseconds, departureAt, requestSha256 },
    };
  }));
  if (new Set(exported.map(route => route.binding.requestSha256)).size !== exported.length)
    throw new Error('Duplicate route snapshots are ambiguous. Export distinct routes.');
  return { schemaVersion: 'isense-research-1' as const, departureAt, routes: exported };
}

const fraction = z.number().finite().min(0).max(1);
const length = z.number().finite().nonnegative();
const resultSchema = z.object({
  schemaVersion: z.literal('2.3'), routeId: z.string().min(1), binding: bindingSchema,
  evidenceType: z.literal('modeled_direct_sunlight'), metric: z.literal('direct_sunlit_length_fraction'),
  unit: z.literal('fraction'), departureAt: instant, rankingEligible: z.literal(false),
  status: z.enum(['modeled', 'unknown']), value: fraction.nullable(),
  coverageFraction: fraction, sunlitFractionBounds: z.tuple([fraction, fraction]),
  modeledSunlitMinutesBounds: z.tuple([length, length]),
  totalRouteLengthMeters: length.positive().max(20000), coveredRouteLengthMeters: length,
  lengthsMeters: z.object({ sunlit: length, shaded: length, night: length, unknown: length }).strict(),
  // This bridge displays the provenance of the bundled, reviewed cache only.
  source: z.object({ gridSha256: z.literal('109eca2ad7406836a932d1d50297488ae60491a69efa4e099c08d6f4fd38b902') }).passthrough(),
  model: z.object({ id: z.literal('dsm-solar-raytrace'), version: z.literal('0.1'),
    radiusMeters: z.literal(300), receiverHeightMeters: z.literal(1.5), routeSpacingMeters: z.literal(5),
    constantWalkingSpeedAssumption: z.literal(true) }).passthrough(),
  limitations: z.array(z.string()).min(1), boundsMeaning: z.string().min(1),
});
export type ResearchPrediction = z.infer<typeof resultSchema>;
const resultFile = z.object({ schemaVersion: z.literal('isense-research-results-1'), routes: z.array(resultSchema).min(1).max(8) });

/** Hashes detect route mismatch/accidental edits, not authenticity of an external file. */
export async function importPredictionResult(input: unknown, route: DemoRoute): Promise<ResearchPrediction> {
  const parsed = resultFile.safeParse(input);
  if (!parsed.success) throw new Error('Unsupported prediction file. Use the v2.3 offline route runner.');
  const matches: ResearchPrediction[] = [];
  for (const result of parsed.data.routes) {
    const { binding: actual } = (await exportPredictionRoutes([route], new Date(result.binding.departureAt))).routes[0];
    if (actual.requestSha256 !== result.binding.requestSha256) continue;
    if (actual.geometrySha256 !== result.binding.geometrySha256 || actual.durationMilliseconds !== result.binding.durationMilliseconds
      || result.departureAt !== actual.departureAt) throw new Error('Prediction metadata does not match its route binding.');
    const n = result.lengthsMeters, total = result.totalRouteLengthMeters;
    const near = (a: number, b: number) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
    const low = n.sunlit / total, high = (n.sunlit + n.unknown) / total;
    const duration = actual.durationMilliseconds / 60000;
    if (!near(n.sunlit + n.shaded + n.night + n.unknown, total)
      || !near(result.coveredRouteLengthMeters, total - n.unknown)
      || !near(result.coverageFraction, 1 - n.unknown / total)
      || !near(result.sunlitFractionBounds[0], low) || !near(result.sunlitFractionBounds[1], high)
      || !near(result.modeledSunlitMinutesBounds[0], low * duration) || !near(result.modeledSunlitMinutesBounds[1], high * duration)
      || (n.unknown >= 1e-8 ? result.value !== null : result.value === null || !near(result.value, low))
      || result.status !== (total - n.unknown > 0 ? 'modeled' : 'unknown'))
      throw new Error('Prediction coverage or units are inconsistent.');
    matches.push(result);
  }
  if (matches.length !== 1) throw new Error('Expected one prediction for this exact route shape and duration. Export this route again.');
  return matches[0];
}
