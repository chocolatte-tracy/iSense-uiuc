import { useEffect, useState } from 'react';
import { decodeSavedPreferences, defaultSavedPreferences, encodeSavedPreferences, PREFERENCES_STORAGE_KEY } from '@/lib/app-state';

export function useSavedPreferences() {
  const [initial] = useState(() => {
    try {
      return { ...decodeSavedPreferences(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)), storageAvailable: true };
    } catch {
      return { ...defaultSavedPreferences(), storageAvailable: false };
    }
  });
  const [preferences, setPreferences] = useState(initial.preferences);
  const [lockedWeights, setLockedWeights] = useState(initial.lockedWeights);
  const [storageAvailable, setStorageAvailable] = useState(initial.storageAvailable);
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, encodeSavedPreferences({ preferences, lockedWeights }));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false); // UI explains that this session cannot persist preferences.
    }
  }, [preferences, lockedWeights]);
  return { preferences, setPreferences, lockedWeights, setLockedWeights, storageAvailable };
}
