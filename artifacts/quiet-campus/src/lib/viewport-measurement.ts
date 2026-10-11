import { standaloneViewport } from './viewport-layout';

/** Local CSS geometry only. No screen dimensions are used to size the app. */
export function measureViewportUnits() {
  const heights: Record<'dynamic' | 'large' | 'legacy' | 'fixed', number> = {
    dynamic: window.innerHeight, large: 0, legacy: 0, fixed: 0,
  };
  for (const [name, unit] of [
    ['dynamic', CSS.supports('height', '100dvh') ? '100dvh' : '100vh'],
    ['large', '100lvh'], ['legacy', '100vh'], ['fixed', null],
  ] as const) {
    if (unit && !CSS.supports('height', unit)) continue;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {
      position: 'fixed', left: '0', top: '0', width: '0',
      visibility: 'hidden', pointerEvents: 'none',
      ...(unit ? { height: unit } : { bottom: '0' }),
    });
    document.body.append(probe);
    heights[name] = probe.getBoundingClientRect().height;
    probe.remove();
  }
  return heights;
}

/** A larger CSS box is not proof of a usable WebView. Probe the last pixel,
 * including the home-indicator background, synchronously and remove it before
 * painting. If iOS excludes the strip, do NOT put navigation controls there. */
export function canReachViewportBottom(height: number) {
  if (!Number.isFinite(height) || height < 1) return false;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, {
    position: 'fixed', left: '50%', top: `${Math.max(0, Math.floor(height) - 2)}px`,
    width: '2px', height: '2px', opacity: '0', pointerEvents: 'auto',
    zIndex: '2147483647',
  });
  document.body.append(probe);
  try {
    const rect = probe.getBoundingClientRect();
    // Fractional last-pixel centres can round up to the excluded viewport edge.
    // Use an integer coordinate strictly inside the final CSS pixel instead.
    return document.elementFromPoint(Math.floor(rect.left) + 1, Math.max(0, Math.floor(height) - 1)) === probe;
  } finally { probe.remove(); }
}

export type ViewportReachability = { key: string; reachable: boolean } | null;

export function syncStandaloneViewport(input: {
  standalone: boolean;
  editing: boolean;
  visualHeight?: number;
  scale?: number;
  previous: ViewportReachability;
}): ViewportReachability {
  const root = document.documentElement;
  const heights = measureViewportUnits();
  root.dataset.viewportUnits = JSON.stringify(heights);
  if (!input.standalone) {
    root.style.removeProperty('--isense-viewport-height');
    root.dataset.viewportPolicy = 'browser-dynamic';
    delete root.dataset.viewportCandidateReachable;
    return null;
  }
  // Zoom is not a new app viewport, and a keyboard is not a missing screen strip.
  if (Math.abs((input.scale ?? 1) - 1) > 0.01) return input.previous;
  const candidate = Math.max(heights.dynamic, heights.large, heights.legacy, heights.fixed);
  const key = `${window.innerWidth}:${candidate}`;
  const reducedVisual = input.visualHeight !== undefined
    && heights.dynamic - input.visualHeight > 100;
  const reuse = input.previous?.key === key && (input.editing || reducedVisual);
  // Trial the actual root size, not just an oversized child. Revert immediately
  // if the WebView cannot hit-test its bottom. No offscreen nav is left behind.
  root.style.setProperty('--isense-viewport-height', `${candidate}px`);
  const reachable = candidate <= heights.dynamic + 1 || (reuse
    ? input.previous!.reachable : canReachViewportBottom(candidate));
  const choice = standaloneViewport({
    dynamicHeight: heights.dynamic, candidateHeight: candidate, candidateReachable: reachable,
  });
  if (choice.policy === 'standalone-expanded') {
    root.style.setProperty('--isense-viewport-height', `${choice.height}px`);
  } else { root.style.removeProperty('--isense-viewport-height'); }
  root.dataset.viewportPolicy = choice.policy;
  root.dataset.viewportCandidateReachable = String(reachable);
  return { key, reachable };
}
