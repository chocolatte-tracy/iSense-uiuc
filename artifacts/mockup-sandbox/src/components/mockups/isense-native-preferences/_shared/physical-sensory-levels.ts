import type { AcceptanceLevel } from './route-scoring';

/** Trial product boundaries, not medical safety limits or validated UIUC standards. */
export const physicalThresholds = Object.freeze({
  noise: Object.freeze({ lowUpperDbA: 45, mediumUpperDbA: 55 }),
  crowds: Object.freeze({ lowUpperPeoplePerM2: 0.18, mediumUpperPeoplePerM2: 0.45 }),
});
export type PhysicalLevel = 'Empty' | 'Low' | 'Medium' | 'High' | 'Unknown';
export type ObservationQuality = 'reviewed' | 'source-reported' | 'invalid' | 'unknown';
type Context = { observedAt?: string | null; source?: string; quality?: ObservationQuality };
export type PhysicalClassification = {
  level: PhysicalLevel; value: number | null; unit: 'dB(A)' | 'people/m²'; reason: string;
};
const unknown = (unit: PhysicalClassification['unit'], reason: string): PhysicalClassification =>
  ({ level: 'Unknown', value: null, unit, reason });
function validContext(context: Context, now: number) {
  if (typeof context.observedAt !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(context.observedAt);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day &&
    Number.isFinite(Date.parse(context.observedAt)) && Date.parse(context.observedAt) <= now &&
    typeof context.source === 'string' && Boolean(context.source.trim()) &&
    (context.quality === 'reviewed' || context.quality === 'source-reported');
}

// Classifies one dated observation only. It never assigns a route score or claims freshness.
export function classifyNoise(input: Context & { noiseDb?: number | null; noiseMetric?: string }, now = Date.now()): PhysicalClassification {
  if (!validContext(input, now) || input.noiseMetric !== 'LAeq' ||
      typeof input.noiseDb !== 'number' || !Number.isFinite(input.noiseDb) || input.noiseDb < 0) {
    return unknown('dB(A)', 'Missing or unusable dated noise measurement; not a confirmed quiet condition.');
  }
  const level = input.noiseDb < physicalThresholds.noise.lowUpperDbA ? 'Low'
    : input.noiseDb < physicalThresholds.noise.mediumUpperDbA ? 'Medium' : 'High';
  return { level, value: input.noiseDb, unit: 'dB(A)', reason: 'Trial classification of this historical observation, not current or whole-route noise.' };
}

export function classifyCrowd(input: Context & {
  measurementType?: string; granularity?: string; peoplePresent?: number | null;
  usableAreaM2?: number | null; location?: string;
}, now = Date.now()): PhysicalClassification {
  if (input.measurementType !== 'occupancy' || input.granularity === 'month') {
    return unknown('people/m²', 'Traffic counts, including monthly reports, are not simultaneous occupancy.');
  }
  if (!validContext(input, now) || input.quality !== 'reviewed' || !input.location?.trim() ||
      !Number.isSafeInteger(input.peoplePresent) || input.peoplePresent! < 0 ||
      typeof input.usableAreaM2 !== 'number' || !Number.isFinite(input.usableAreaM2) || input.usableAreaM2 <= 0) {
    return unknown('people/m²', 'Missing valid occupancy, area, location, time, or reviewed observation quality.');
  }
  const density = input.peoplePresent! / input.usableAreaM2;
  if (!Number.isFinite(density)) return unknown('people/m²', 'Density is outside a usable numerical range.');
  const level = density === 0 ? 'Empty'
    : density < physicalThresholds.crowds.lowUpperPeoplePerM2 ? 'Low'
    : density < physicalThresholds.crowds.mediumUpperPeoplePerM2 ? 'Medium' : 'High';
  return { level, value: density, unit: 'people/m²', reason: 'Occupancy at the observation time only; not a promise of current conditions.' };
}

// Separate explanation model: deliberately not called by the prototype ranking algorithm.
export function physicalAcceptance(level: PhysicalLevel, acceptance: AcceptanceLevel): 'accepted' | 'outside' | 'unknown' {
  if (level === 'Unknown') return 'unknown';
  if (level === 'Empty' || level === 'Low' || acceptance === 'high') return 'accepted';
  if (level === 'Medium' && acceptance === 'medium') return 'accepted';
  return 'outside';
}
