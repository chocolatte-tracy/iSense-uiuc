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

