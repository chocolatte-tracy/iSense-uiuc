import { initialPreferences, weightKeys, type PreferenceWeights, type WeightKey } from './route-scoring';

export type AppScreen = 'map' | 'preferences' | 'routes' | 'reports';
export const PREFERENCES_STORAGE_KEY = 'isense:sensory-preferences:v1';
export type SavedPreferences = { preferences: PreferenceWeights; lockedWeights: WeightKey[] };
export const defaultSavedPreferences = (): SavedPreferences => ({ preferences: { ...initialPreferences }, lockedWeights: [] });

export function resolveAppScreen(hash: string): AppScreen {
  const value = hash.replace(/^#/, '').toLowerCase();
  if (value === 'preferences' || value === 'preferences-title') return 'preferences';
  if (value === 'routes' || value === 'routes-title') return 'routes';
  if (value === 'reports' || value === 'reports-title') return 'reports';
  return 'map'; // Map is home; obsolete Install and unknown fragments cannot restore a removed screen.
}

export function decodeSavedPreferences(raw: string | null): SavedPreferences {
  if (!raw || raw.length > 8192) return defaultSavedPreferences();
  try {
    const value = JSON.parse(raw);
    const p = value?.preferences;
    if (value?.version !== 1 || !p || typeof p !== 'object' || Array.isArray(p)
      || !weightKeys.every(key => Number.isInteger(p[key]) && p[key] >= 0 && p[key] <= 100)
      || weightKeys.reduce((sum, key) => sum + p[key], 0) !== 100
      || !Number.isSafeInteger(p.maxExtraWalkingMinutes) || p.maxExtraWalkingMinutes < 0
      || !['noiseAcceptance', 'crowdAcceptance', 'sunAcceptance'].every(key => ['low', 'medium', 'high'].includes(p[key]))) {
      return defaultSavedPreferences();
    }
    // Deliberate whitelist: never retain locations, imported observations, credentials or unknown fields.
    const preferences: PreferenceWeights = {
      avoidNoise: p.avoidNoise, avoidCrowds: p.avoidCrowds, preferShade: p.preferShade,
      prioritizeShortWalkingTime: p.prioritizeShortWalkingTime, maxExtraWalkingMinutes: p.maxExtraWalkingMinutes,
      noiseAcceptance: p.noiseAcceptance, crowdAcceptance: p.crowdAcceptance, sunAcceptance: p.sunAcceptance,
    };
    const lockedWeights = Array.isArray(value.lockedWeights)
      ? weightKeys.filter(key => value.lockedWeights.includes(key)) : [];
    return { preferences, lockedWeights };
  } catch {
    return defaultSavedPreferences();
  }
}

export function encodeSavedPreferences(value: SavedPreferences): string {
  const sanitized = decodeSavedPreferences(JSON.stringify({ version: 1, ...value }));
  return JSON.stringify({ version: 1, ...sanitized });
}
