import { weightKeys, type PreferenceWeights, type WeightKey } from './route-scoring';
export const preferencePresets = [
  { id: 'balanced', name: 'Balanced', weights: [25, 25, 25, 25] },
  { id: 'quieter', name: 'Quieter', weights: [60, 20, 10, 10] },
  { id: 'less-crowded', name: 'Less Crowded', weights: [20, 60, 10, 10] },
  { id: 'fastest', name: 'Fastest', weights: [10, 10, 10, 70] },
] as const;
export type PreferencePresetId = typeof preferencePresets[number]['id'];
// Explicit preset clicks only. Retain acceptance, minutes, and locked shares.
export function applyPreferencePreset(previous: PreferenceWeights, id: PreferencePresetId, locks: readonly WeightKey[] = []): PreferenceWeights {
  const preset = preferencePresets.find(p => p.id === id)!;
  const free = weightKeys.map((key, index) => ({ key, target: preset.weights[index] })).filter(p => !locks.includes(p.key));
  if (free.length < 2) return previous;
  const budget = 100 - weightKeys.filter(key => locks.includes(key)).reduce((sum, key) => sum + previous[key], 0);
  const denominator = free.reduce((sum, p) => sum + p.target, 0);
  const shares = free.map((p, index) => {
    const exact = budget * p.target / denominator;
    return { ...p, index, value: Math.floor(exact), fraction: exact % 1 };
  });
  const remainder = budget - shares.reduce((sum, p) => sum + p.value, 0);
  const order = [...shares].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i++) order[i].value++;
  const next = { ...previous };
  shares.forEach(p => { next[p.key] = p.value; });
  return next;
}
export function activePreferencePreset(preferences: PreferenceWeights) {
  return preferencePresets.find(p => weightKeys.every((key, i) => preferences[key] === p.weights[i]))?.id;
}
