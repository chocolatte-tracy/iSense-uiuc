/// <reference types="google.maps" />
import { GoogleServiceError } from './google-service-error';

type MapsWindow = Window & { isenseMapsReady?: () => void; gm_authFailure?: () => void };
let loader: Promise<void> | undefined;
let authFailure: GoogleServiceError | undefined;
let bridgeInstalled = false;
const listeners = new Set<(error: GoogleServiceError) => void>();

function authBridge() {
  if (bridgeInstalled) return;
  bridgeInstalled = true;
  const target = window as MapsWindow;
  const previous = target.gm_authFailure;
  target.gm_authFailure = () => {
    authFailure = new GoogleServiceError('GOOGLE_BROWSER_AUTH_ERROR',
      'Google rejected browser authorization. The callback does not identify whether the cause is the key, API permissions, referrer restrictions or billing. Check the exact Google console error.');
    for (const listener of listeners) listener(authFailure);
    previous?.();
  };
}

export function onGoogleAuthFailure(listener: (error: GoogleServiceError) => void) {
  authBridge(); listeners.add(listener);
  if (authFailure) listener(authFailure);
  return () => { listeners.delete(listener); };
}

// Maps and Places share one SDK. Disabled features never call this loader.
export function loadGoogleMaps(key: string): Promise<void> {
  if (!key.trim()) return Promise.reject(new GoogleServiceError('BROWSER_KEY_MISSING', 'The owner must configure the restricted browser key.'));
  authBridge();
  if (authFailure) return Promise.reject(authFailure);
  const maps = (window as unknown as { google?: { maps?: Partial<typeof google.maps> } }).google?.maps;
  if (maps?.Map || maps?.importLibrary) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const target = window as MapsWindow;
    const script = document.createElement('script');
    let settled = false;
    let unsubscribe = () => {};
    const finish = (error?: GoogleServiceError) => {
      if (settled) return;
      settled = true; clearTimeout(timer); unsubscribe();
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timer = setTimeout(() => finish(new GoogleServiceError('SDK_TIMEOUT', 'Google Maps JavaScript timed out. Route cards remain available.')), 15000);
    unsubscribe = onGoogleAuthFailure(error => finish(error));
    target.isenseMapsReady = () => finish();
    const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: 'isenseMapsReady' });
    script.id = 'isense-google-maps-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => finish(new GoogleServiceError('SDK_LOAD_FAILED', 'Google Maps JavaScript could not load. Check the network or content blocking; this does not prove the key is invalid.'));
    document.head.append(script);
  }).catch(error => { loader = undefined; throw error; });
  return loader;
}
