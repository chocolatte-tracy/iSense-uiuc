import type { RouteEvidence } from './campus-observations';
import type { SunContext } from './sun-context';
import { rankingMetricEvidence, type RankingMetricEvidence } from './ranking-evidence';

export type AcceptanceLevel = 'low' | 'medium' | 'high';
export type WeightKey = 'avoidNoise' | 'avoidCrowds' | 'preferShade' | 'prioritizeShortWalkingTime';
export type AcceptanceKey = 'noiseAcceptance' | 'crowdAcceptance' | 'sunAcceptance';
export const weightKeys: WeightKey[] = ['avoidNoise', 'avoidCrowds', 'preferShade', 'prioritizeShortWalkingTime'];
export const acceptanceLimits: Record<AcceptanceLevel, number> = { low: 33, medium: 66, high: 100 };

export type PreferenceWeights = {
  avoidNoise: number;
  avoidCrowds: number;
  preferShade: number;
  prioritizeShortWalkingTime: number;
  maxExtraWalkingMinutes: number;
  noiseAcceptance: AcceptanceLevel;
  crowdAcceptance: AcceptanceLevel;
  sunAcceptance: AcceptanceLevel;
};

export const initialPreferences: PreferenceWeights = {
  avoidNoise: 40, avoidCrowds: 30, preferShade: 20, prioritizeShortWalkingTime: 10,
  maxExtraWalkingMinutes: 5, noiseAcceptance: 'medium', crowdAcceptance: 'medium', sunAcceptance: 'medium',
};

export function resetPreferenceSettings(): { preferences: PreferenceWeights; lockedWeights: WeightKey[] } {
  return { preferences: { ...initialPreferences }, lockedWeights: [] };
}

// Explain sensory exclusions without relaxing scoring or the hard time limit.
export function outsideSensoryRoutes(routes: DemoRoute[], ranked: DemoRoute[], maxExtraMinutes: number) {
  const shortest = Math.min(...routes.map(route => route.walkingTimeMinutes));
  const included = new Set(ranked.map(route => route.id));
  return routes.filter(route => !included.has(route.id) && route.walkingTimeMinutes - shortest <= maxExtraMinutes);
}

// Largest-remainder allocation keeps integer percentages at exactly 100.
export function weightAdjustmentLimits(preferences: PreferenceWeights, key: WeightKey, locked: readonly WeightKey[] = []) {
  const lockedTotal = weightKeys.reduce((sum, candidate) => sum + (locked.includes(candidate) ? preferences[candidate] : 0), 0);
  const max = Math.max(0, 100 - lockedTotal);
  const isLocked = locked.includes(key);
  const unlockedCount = weightKeys.filter((candidate) => !locked.includes(candidate)).length;
  return { max: isLocked ? preferences[key] : max, disabled: isLocked || unlockedCount <= 1 || max === 0, isLocked };
}

export function toggleWeightLock(locked: readonly WeightKey[], key: WeightKey): WeightKey[] {
  return locked.includes(key) ? locked.filter((candidate) => candidate !== key) : [...locked, key];
}

export function rebalanceWeights(preferences: PreferenceWeights, key: WeightKey, value: number, locked: readonly WeightKey[] = []): PreferenceWeights {
  const limits = weightAdjustmentLimits(preferences, key, locked);
  if (limits.disabled || !Number.isFinite(value)) return preferences;
  const nextValue = Math.round(Math.max(0, Math.min(limits.max, value)));
  const others = weightKeys.filter((candidate) => candidate !== key && !locked.includes(candidate));
  const total = others.reduce((sum, candidate) => sum + preferences[candidate], 0);
  const remaining = limits.max - nextValue;
  const shares = others.map((candidate, index) => {
    const exact = total === 0 ? remaining / others.length : remaining * preferences[candidate] / total;
    return { candidate, index, whole: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  const left = remaining - shares.reduce((sum, share) => sum + share.whole, 0);
  const ordered = [...shares].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < left; index++) ordered[index].whole++;
  const next = { ...preferences, [key]: nextValue };
  for (const share of shares) next[share.candidate] = share.whole;
  return next;
}

export type CandidateWaypoint = {
  latitude: number;
  longitude: number;
};

export type DemoRoute = {
  id: string;
  routeCode: string;
  name: string;
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  walkingTimeMinutes: number;
  distanceMiles: number;
  durationSeconds?: number;
  distanceMeters?: number;
  noiseCost: number;
  crowdCost: number;
  sunExposureCost: number;
  directSunlightExcluded?: boolean;
  daytimeSunExposureCost?: number;
  sensoryEvidence?: RouteEvidence;
  coordinates: [number, number][];
  candidateWaypoints: CandidateWaypoint[];
  researchSourceUrl: string;
  navigationOrigin?: string;
  navigationDestination?: string;
  source?: 'google';
  labels?: string[];
};

export type ScoreBreakdown = {
  metric: 'noise' | 'crowds' | 'sunlight' | 'walkingTime';
  weight: number;
  effectivePercent: number;
  rankingValue: number;
  penalty: number;
  contribution: number;
  evidence?: RankingMetricEvidence;
};
export type ScoredRoute = DemoRoute & {
  score: number;
  meetsAcceptance: boolean;
  acceptanceStatus: 'met' | 'exceeded' | 'unknown';
  provisional: boolean;
  scoreBreakdown: ScoreBreakdown[];
};

export function applySunContext(route: DemoRoute, context?: SunContext): DemoRoute {
  const original = route.daytimeSunExposureCost ?? route.sunExposureCost;
  if (context?.phase === 'nighttime') return {
    ...route, sunExposureCost: 0, daytimeSunExposureCost: original, directSunlightExcluded: true,
  };
  return route.directSunlightExcluded ? { ...route, sunExposureCost: original, directSunlightExcluded: false } : route;
}

export function effectivePreferenceWeights(preferences: PreferenceWeights, context?: SunContext): PreferenceWeights {
  return context?.phase === 'nighttime' ? { ...preferences, preferShade: 0 } : preferences;
}

const weightsFor = (preferences: PreferenceWeights) => [
  preferences.avoidNoise,
  preferences.avoidCrowds,
  preferences.preferShade,
  preferences.prioritizeShortWalkingTime,
];

export function rankRoutes(
  routes: DemoRoute[],
  preferences: PreferenceWeights,
  sunContext?: SunContext,
): ScoredRoute[] {
  if (routes.length === 0) return [];
  routes = routes.map(route => applySunContext(route, sunContext));
  const fastest = Math.min(...routes.map((route) => route.walkingTimeMinutes));
  const slowest = Math.max(...routes.map((route) => route.walkingTimeMinutes));
  const timeRange = slowest - fastest;
  const eligible = routes.filter(
    (route) =>
      route.walkingTimeMinutes - fastest <= preferences.maxExtraWalkingMinutes,
  );
  const weights = weightsFor(effectivePreferenceWeights(preferences, sunContext));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const limits = [
    acceptanceLimits[preferences.noiseAcceptance],
    acceptanceLimits[preferences.crowdAcceptance],
    acceptanceLimits[preferences.sunAcceptance],
  ];
  const evidenceFor = (route: DemoRoute) =>
    (['noise', 'crowds', 'sunlight'] as const).map(metric => rankingMetricEvidence(route, metric));
  const meetsAcceptance = (route: DemoRoute) =>
    evidenceFor(route).every((evidence, index) => evidence.rankingValue <= limits[index]);
  const matching = eligible.filter(meetsAcceptance);
  // Keep the walking-time limit hard; show closest sensory alternatives only
  // when no time-eligible route satisfies all three tolerance settings.
  const candidates = matching.length ? matching : eligible;

  return candidates
    .map((route) => {
      const normalizedTimeCost =
        timeRange === 0
          ? 0
          : ((route.walkingTimeMinutes - fastest) / timeRange) * 100;
      const evidence = evidenceFor(route);
      const sensoryCosts = evidence.map(({ rankingValue: cost }, index) => {
        const limit = limits[index];
        const excess = limit === 100 ? 0 : Math.max(0, cost - limit) / (100 - limit) * 100;
        // Preserve lower-exposure preferences even inside the acceptable band,
        // while giving a larger penalty to exposure above the chosen limit.
        return cost * 0.25 + excess * 0.75;
      });
      const costs = [...sensoryCosts, normalizedTimeCost];
      const score =
        totalWeight === 0
          ? normalizedTimeCost
          : costs.reduce((sum, cost, index) => sum + cost * weights[index], 0) /
            totalWeight;
      const unknown = evidence.some(item => item.status === 'unknown' || item.unknownPercent > 0);
      const knownExcess = evidence.some((item, index) => item.unknownPercent === 0
        && item.displayValue !== null && item.rankingValue > limits[index]);
      const acceptanceStatus = knownExcess ? 'exceeded' : unknown ? 'unknown' : 'met';
      const rankingValues = [...evidence.map(item => item.rankingValue), normalizedTimeCost];
      const metrics = ['noise', 'crowds', 'sunlight', 'walkingTime'] as const;
      const scoreBreakdown = costs.map((penalty, index) => ({
        metric: metrics[index], weight: weights[index],
        effectivePercent: totalWeight ? weights[index] / totalWeight * 100 : index === 3 ? 100 : 0,
        rankingValue: rankingValues[index], penalty,
        contribution: totalWeight ? penalty * weights[index] / totalWeight : index === 3 ? normalizedTimeCost : 0,
        ...(index < 3 ? { evidence: evidence[index] } : {}),
      }));
      return {
        ...route, score, meetsAcceptance: meetsAcceptance(route),
        acceptanceStatus: acceptanceStatus as ScoredRoute['acceptanceStatus'],
        provisional: evidence.some(item => item.provisional), scoreBreakdown,
      };
    })
    .sort((a, b) =>
      totalWeight === 0
        ? a.walkingTimeMinutes - b.walkingTimeMinutes
          || (a.source === 'google' && b.source === 'google' ? stableRouteKey(a).localeCompare(stableRouteKey(b)) : 0)
        : a.score - b.score || a.walkingTimeMinutes - b.walkingTimeMinutes
          || stableRouteKey(a).localeCompare(stableRouteKey(b)),
    );
}

// Google IDs are response-local. Equal alternatives should not change their
// geometry winner just because the provider returns a different array order.
function stableRouteKey(route: DemoRoute) {
  return route.coordinates.length
    ? route.coordinates.map(point => point.map(value => value.toFixed(6)).join(',')).join(';')
    : route.id;
}
