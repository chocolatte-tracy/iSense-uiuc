import { acceptanceLimits, type DemoRoute, type PreferenceWeights } from './route-scoring';
import { comfortFactors, comfortOptions } from './sensory-comfort';
import { rankingMetricEvidence } from './ranking-evidence';

function extraTime(minutes: number) {
  const seconds = Math.round(minutes * 60);
  if (seconds === 0) return 'Less than 1 sec';
  const wholeMinutes = Math.floor(seconds / 60);
  return [wholeMinutes ? `${wholeMinutes} min` : '', seconds % 60 ? `${seconds % 60} sec` : ''].filter(Boolean).join(' ');
}

// Presentation only: this does not change route eligibility or ranking.
export function routeTradeoffs(route: DemoRoute, alternatives: DemoRoute[], preferences: PreferenceWeights) {
  const comparisons = alternatives.length ? alternatives : [route];
  const pros: string[] = [];
  const cons: string[] = [];
  for (const factor of comfortFactors) {
    // Astronomical nighttime is not a measured shade advantage for any path.
    if (factor.costKey === 'sunExposureCost' && route.directSunlightExcluded) continue;
    const metric = factor.key === 'noiseAcceptance' ? 'noise'
      : factor.key === 'crowdAcceptance' ? 'crowds' : 'sunlight';
    const evidence = rankingMetricEvidence(route, metric);
    const value = evidence.displayValue;
    const values = comparisons.map(candidate => rankingMetricEvidence(candidate, metric))
      .filter(item => item.displayValue !== null && item.unknownPercent === 0)
      .map(item => item.displayValue!);
    if (value === null || evidence.unknownPercent > 0 || !values.length) {
      cons.push(`${factor.title}: Unknown — missing usable observations; comfort cannot be confirmed.`);
      continue;
    }
    const minimum = Math.min(...values);
    const level = preferences[factor.key];
    const limit = acceptanceLimits[level];
    if (value > limit) {
      cons.push(`${factor.title}: ${value}/100 exceeds your “${comfortOptions[factor.key][level].label}” prototype cutoff (${limit}/100).`);
    } else if (value === minimum && values.length > 1) {
      const scope = values.length === comparisons.length ? 'these options' : 'options with comparable values (unknown excluded)';
      pros.push(`${factor.title}: lowest index among ${scope} (${value}/100; ties possible), within your prototype cutoff only—not confirmed real-world comfort.`);
    } else if (value > minimum) {
      cons.push(`${factor.title}: higher index (${value}/100) than the lowest option (${minimum}/100).`);
    } else {
      pros.push(`${factor.title}: ${value}/100 is within your selected prototype cutoff only—not confirmed real-world comfort.`);
    }
  }
  cons.push('Noise and crowds: missing usable raw observations for this path. Physical conditions and real-world comfort are Unknown; DEMO/prototype indices do not confirm them.');
  const shortest = Math.min(...comparisons.map(candidate => candidate.walkingTimeMinutes));
  const extra = route.walkingTimeMinutes - shortest;
  if (extra <= 0) pros.push('Shortest walking time among these options; ties possible.');
  else cons.push(`${extraTime(extra)} longer than the shortest option.`);
  return { pros, cons };
}
