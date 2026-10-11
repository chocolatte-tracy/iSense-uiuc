import { z } from 'zod';
import type { DemoRoute } from './route-scoring';

const point = z.tuple([z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180)]);
const timestamp = z.string().datetime({ offset: true });
const metric = z.object({
  value: z.number().finite().min(0).max(100),
  status: z.enum(['verified', 'estimate']),
  method: z.string().trim().min(1).max(500),
  reviewedBy: z.string().trim().min(1).max(100).optional(),
  reviewedAt: timestamp.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'verified' && (!value.reviewedBy || !value.reviewedAt)) {
    ctx.addIssue({ code: 'custom', message: 'Verified values require reviewedBy and reviewedAt.' });
  }
});
const observationSchema = z.object({
  id: z.string().trim().min(1).max(100),
  segmentId: z.string().trim().min(1).max(100),
  observedAt: timestamp,
  source: z.string().trim().min(1).max(500),
  conditions: z.string().trim().min(1).max(1000),
  noise: metric.optional(),
  crowds: metric.optional(),
  sunlight: metric.optional(),
}).strict().refine(value => value.noise || value.crowds || value.sunlight, 'At least one sensory value is required.');
const datasetSchema = z.object({
  version: z.literal(1),
  segments: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    direction: z.enum(['forward', 'both']),
    path: z.array(point).min(2).max(10000),
  }).strict()).max(1000),
  observations: z.array(observationSchema).max(10000),
}).strict();

export type ObservationDataset = z.infer<typeof datasetSchema>;
export type CampusObservation = ObservationDataset['observations'][number];
export type SensoryMetric = 'noise' | 'crowds' | 'sunlight';
export type SensoryEvidence = {
  status: 'verified' | 'estimate' | 'mixed' | 'demo';
  verifiedPercent: number;
  estimatedPercent: number;
  demoPercent: number;
  observationIds: string[];
};
export type RouteEvidence = {
  metrics: Record<SensoryMetric, SensoryEvidence>;
  observations: CampusObservation[];
};
export const emptyObservations: ObservationDataset = { version: 1, segments: [], observations: [] };
export const LIVE_DEMO_COST = 50;
const metrics: SensoryMetric[] = ['noise', 'crowds', 'sunlight'];
const costs = { noise: 'noiseCost', crowds: 'crowdCost', sunlight: 'sunExposureCost' } as const;
// Match decoded geometry to ~0.1 m precision, never nearby paths or route IDs.
const pointKey = ([lat, lng]: [number, number]) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

export function parseObservationDataset(input: unknown, now = Date.now()): ObservationDataset {
  const data = datasetSchema.parse(input);
  for (const collection of [data.segments, data.observations]) {
    if (new Set(collection.map(item => item.id)).size !== collection.length) throw new Error('Duplicate IDs are not allowed.');
  }
  const segments = new Set(data.segments.map(segment => segment.id));
  for (const segment of data.segments) {
    if (segment.path.some((p, i) => i > 0 && pointKey(p) === pointKey(segment.path[i - 1]))) {
      throw new Error(`Segment ${segment.id}: consecutive coordinates must differ.`);
    }
  }
  for (const observation of data.observations) {
    if (!segments.has(observation.segmentId)) throw new Error(`Unknown segment: ${observation.segmentId}`);
    if (Date.parse(observation.observedAt) > now) throw new Error(`Observation ${observation.id}: observedAt cannot be in the future.`);
    for (const key of metrics) {
      const reviewedAt = observation[key]?.reviewedAt;
      if (reviewedAt && (Date.parse(reviewedAt) < Date.parse(observation.observedAt) || Date.parse(reviewedAt) > now)) {
        throw new Error(`Observation ${observation.id}: review date must be after observation and not in the future.`);
      }
    }
  }
  return data;
}

function length(a: [number, number], b: [number, number]) {
  const radians = Math.PI / 180;
  const dLat = (b[0] - a[0]) * radians;
  const dLng = (b[1] - a[1]) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Only a whole contiguous segment match provides evidence for its edges.
 * Latest observation wins per metric/edge; tied timestamps use the stable ID.
 * Unobserved lengths retain demo cost, never extrapolated from covered lengths.
 */
export function applyCampusObservations(route: DemoRoute, data: ObservationDataset): DemoRoute {
  if (route.source !== 'google' || route.coordinates.length < 2) return route;
  const points = route.coordinates.map(pointKey);
  const edgeObservations: CampusObservation[][] = Array.from({ length: points.length - 1 }, () => []);
  const bySegment = new Map<string, CampusObservation[]>();
  for (const observation of data.observations) {
    const list = bySegment.get(observation.segmentId) ?? [];
    list.push(observation);
    bySegment.set(observation.segmentId, list);
  }
  for (const segment of data.segments) {
    const segmentPoints = segment.path.map(pointKey);
    const variants = segment.direction === 'both' ? [segmentPoints, [...segmentPoints].reverse()] : [segmentPoints];
    for (const variant of variants) {
      for (let start = 0; start <= points.length - variant.length; start++) {
        if (!variant.every((p, offset) => p === points[start + offset])) continue;
        for (let edge = start; edge < start + variant.length - 1; edge++) {
          edgeObservations[edge].push(...(bySegment.get(segment.id) ?? []));
        }
      }
    }
  }
  const lengths = route.coordinates.slice(1).map((p, i) => length(route.coordinates[i], p));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const result = { ...route };
  const evidence = {} as Record<SensoryMetric, SensoryEvidence>;
  const used = new Map<string, CampusObservation>();
  for (const key of metrics) {
    let weighted = 0, verified = 0, estimated = 0, demo = 0;
    const ids = new Set<string>();
    edgeObservations.forEach((candidates, edge) => {
      if (lengths[edge] === 0) return;
      const selected = candidates.filter(o => o[key]).sort((a, b) =>
        Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.id.localeCompare(b.id))[0];
      const value = selected?.[key];
      // Accumulate deviations so identical demo placeholders stay exactly 50;
      // floating-point length division must not break a shortest-walk tie.
      weighted += lengths[edge] * ((value?.value ?? LIVE_DEMO_COST) - LIVE_DEMO_COST);
      if (!selected || !value) demo += lengths[edge];
      else {
        if (value.status === 'verified') verified += lengths[edge];
        else estimated += lengths[edge];
        ids.add(selected.id);
        used.set(selected.id, selected);
      }
    });
    result[costs[key]] = total > 0 ? LIVE_DEMO_COST + weighted / total : LIVE_DEMO_COST;
    evidence[key] = {
      status: total === 0 || demo === total ? 'demo' : verified === total ? 'verified' : estimated === total ? 'estimate' : 'mixed',
      verifiedPercent: total ? verified / total * 100 : 0,
      estimatedPercent: total ? estimated / total * 100 : 0,
      demoPercent: total ? demo / total * 100 : 100,
      observationIds: [...ids].sort(),
    };
  }
  result.sensoryEvidence = { metrics: evidence, observations: [...used.values()] };
  return result;
}

export function sensorySummary(route: DemoRoute) {
  const evidence = route.sensoryEvidence;
  if (!evidence || metrics.every(key => evidence.metrics[key].status === 'demo')) return 'DEMO DATA · no mapped campus observations';
  if (metrics.every(key => evidence.metrics[key].status === 'verified')) return 'Verified observations · historical, not current conditions';
  if (metrics.every(key => evidence.metrics[key].status === 'estimate')) return 'Estimates · not verified campus measurements';
  return 'Mixed sensory evidence · see coverage (unmapped portions are DEMO DATA)';
}
