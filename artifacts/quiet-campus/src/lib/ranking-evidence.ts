import type { DemoRoute } from './route-scoring';
import type { SensoryMetric } from './campus-observations';
import { usableAutomaticSunlight } from './solar-ranking';

const fields = { noise: 'noiseCost', crowds: 'crowdCost', sunlight: 'sunExposureCost' } as const;
export type RankingMetricEvidence = {
  metric: SensoryMetric;
  displayValue: number | null;
  rankingValue: number;
  status: 'verified' | 'estimate' | 'mixed' | 'demo' | 'unknown' | 'excluded' | 'modeled';
  verifiedPercent: number;
  estimatedPercent: number;
  unknownPercent: number;
  provisional: boolean;
  explanation: string;
};
const validCost = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
const percent = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;

/** Unmapped live-route lengths are not observations. The original 50 DEMO
 * placeholder remains in the route; only ranking uses the conservative upper
 * bound of 100 for those lengths. Never describe that bound as measured noise,
 * crowd density or sunlight. Research demo routes retain their supplied values.
 */
export function rankingMetricEvidence(route: DemoRoute, metric: SensoryMetric): RankingMetricEvidence {
  const sunlight = metric === 'sunlight' ? usableAutomaticSunlight(route) : null;
  if (sunlight) return {
    metric, displayValue: sunlight.value! * 100, rankingValue: sunlight.value! * 100,
    status: 'modeled', verifiedPercent: 0, estimatedPercent: 100, unknownPercent: 0, provisional: true,
    explanation: 'Historical terrain model: direct-sun percentage × sunlight weight, using existing tolerance penalties. Experimental, not field-validated comfort or live weather.',
  };
  if (metric === 'sunlight' && route.directSunlightExcluded) return {
    metric, displayValue: 0, rankingValue: 0, status: 'excluded',
    verifiedPercent: 0, estimatedPercent: 0, unknownPercent: 0, provisional: false,
    explanation: 'Nighttime: direct sunlight is excluded, not measured shade or a lighting-safety assessment.',
  };
  const raw = route[fields[metric]];
  const valid = validCost(raw);
  const evidence = route.sensoryEvidence?.metrics[metric];
  const live = route.source === 'google';
  const unknownPercent = !valid ? 100 : percent(evidence?.demoPercent, live ? 100 : 0);
  const verifiedPercent = percent(evidence?.verifiedPercent, 0);
  const estimatedPercent = percent(evidence?.estimatedPercent, 0);
  const rankingValue = !valid ? 100 : live
    ? Math.min(100, Math.max(0, raw - unknownPercent * 0.5) + unknownPercent)
    : raw;
  const status = !valid || (live && unknownPercent === 100) ? 'unknown' : evidence?.status ?? 'demo';
  const provisional = status !== 'verified';
  return {
    metric, displayValue: status === 'unknown' ? null : raw,
    rankingValue, status, verifiedPercent, estimatedPercent, unknownPercent, provisional,
    explanation: status === 'unknown'
      ? 'No mapped observation. Unknown is not quiet; ranking uses an uncertainty upper bound, not a measurement.'
      : live && unknownPercent > 0
        ? `${unknownPercent.toFixed(0)}% unmapped. Ranking conservatively reserves the unknown portion; the displayed estimate is not full-route measurement.`
        : status === 'demo'
          ? 'Supplied synthetic DEMO value, not an observed campus condition.'
          : status === 'verified'
            ? 'Mapped, team-reviewed historical observation; not a current-conditions guarantee.'
            : 'Mapped research estimate or mixed evidence; not fully verified or live.',
  };
}

export function routeIsProvisional(route: DemoRoute) {
  return (['noise', 'crowds', 'sunlight'] as const).some(metric => rankingMetricEvidence(route, metric).provisional);
}
