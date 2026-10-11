/** Only a focused editor obscured by a keyboard may override CSS viewport height.
 * A short/stale VisualViewport (or pinch zoom) is not a browser-toolbar spacer. */
export function keyboardViewport(input: {
  layoutHeight: number;
  visualHeight?: number;
  offsetTop?: number;
  scale?: number;
  editing: boolean;
}): { height: number; top: number } | null {
  const { layoutHeight, visualHeight, editing, scale = 1 } = input;
  if (!editing || !Number.isFinite(layoutHeight) || layoutHeight <= 0
    || visualHeight === undefined || !Number.isFinite(visualHeight) || visualHeight <= 0
    || !Number.isFinite(scale) || Math.abs(scale - 1) > 0.01
    || layoutHeight - visualHeight <= 100) return null;
  const top = Number.isFinite(input.offsetTop) ? Math.max(0, input.offsetTop!) : 0;
  return { height: visualHeight, top };
}

/** Never extend interactive UI into a region merely because screen.height or
 * a large viewport unit says it exists. The browser must hit-test that region. */
export function standaloneViewport(input: {
  dynamicHeight: number;
  candidateHeight: number;
  candidateReachable: boolean;
}) {
  const { dynamicHeight, candidateHeight, candidateReachable } = input;
  if (!Number.isFinite(candidateHeight) || candidateHeight <= dynamicHeight + 1) {
    return { height: dynamicHeight, policy: 'standalone-dynamic' as const };
  }
  return candidateReachable
    ? { height: candidateHeight, policy: 'standalone-expanded' as const }
    : { height: dynamicHeight, policy: 'standalone-platform-limited' as const };
}
