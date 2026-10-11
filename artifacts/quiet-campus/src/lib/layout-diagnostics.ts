/** Geometry only: no keys, locations, preferences, reports or network requests. */
export function collectLayoutDiagnostics() {
  const root = document.documentElement;
  const rect = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element?.getClientRects().length) return null;
    const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
    return { x, y, width, height, top, right, bottom, left };
  };
  const insetProbe = document.createElement('div');
  Object.assign(insetProbe.style, {
    position: 'fixed', visibility: 'hidden', pointerEvents: 'none',
    padding: 'var(--isense-safe-area-top) var(--isense-safe-area-right) var(--isense-safe-area-bottom) var(--isense-safe-area-left)',
  });
  document.body.append(insetProbe);
  const measured = getComputedStyle(insetProbe);
  const safeAreas = { top: parseFloat(measured.paddingTop), right: parseFloat(measured.paddingRight),
    bottom: parseFloat(measured.paddingBottom), left: parseFloat(measured.paddingLeft) };
  insetProbe.remove();
  const visual = window.visualViewport;
  const rectangles = {
    appShell: rect('.app-shell'), main: rect('.page-content'), navigation: rect('.mobile-navigation'),
    mapSection: rect('[data-testid="map-section"]'), googleMap: rect('.google-map'),
    routePlanner: rect('[data-testid="route-planner"]'), locationSearch: rect('.location-search-backdrop'),
  };
  const cssViewportHeight = document.querySelector('[data-isense-viewport-probe]')?.getBoundingClientRect().height ?? window.innerHeight;
  const viewportBottom = root.dataset.keyboardVisible === 'true' && visual
    ? visual.height + visual.offsetTop : cssViewportHeight;
  const map = rectangles.mapSection, planner = rectangles.routePlanner, nav = rectangles.navigation;
  return {
    layoutVersion: 'pwa-reachable-viewport-2026-10-11', capturedAt: new Date().toISOString(),
    standaloneDetected: window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    keyboardVisible: root.dataset.keyboardVisible === 'true', visibility: document.visibilityState,
    window: { innerHeight: window.innerHeight, innerWidth: window.innerWidth },
    screen: { width: window.screen.width, height: window.screen.height,
      availableWidth: window.screen.availWidth, availableHeight: window.screen.availHeight,
      devicePixelRatio: window.devicePixelRatio },
    browser: { userAgent: navigator.userAgent, topLevel: window.self === window.top },
    viewportPolicy: root.dataset.viewportPolicy ?? 'pending',
    viewportUnits: root.dataset.viewportUnits ? JSON.parse(root.dataset.viewportUnits) : null,
    candidateBottomReachable: root.dataset.viewportCandidateReachable === undefined
      ? null : root.dataset.viewportCandidateReachable === 'true',
    document: { clientHeight: root.clientHeight, clientWidth: root.clientWidth,
      bodyScrollHeight: document.body.scrollHeight, bodyScrollWidth: document.body.scrollWidth },
    visualViewport: visual ? { height: visual.height, width: visual.width, offsetTop: visual.offsetTop,
      offsetLeft: visual.offsetLeft, scale: visual.scale } : null,
    cssViewportHeight, safeAreas, rectangles,
    checks: {
      // This is a web-layout check, NOT proof of reaching the physical screen.
      belowNavigationGap: nav ? viewportBottom - nav.bottom : null,
      screenMinusReportedViewport: visual && visual.scale === 1 ? window.screen.height - visual.height : null,
      physicalScreenGapVerified: false,
      mainToNavigationGap: nav && rectangles.main ? nav.top - rectangles.main.bottom : null,
      mapPlannerIntersect: map && planner ? map.left < planner.right && map.right > planner.left
        && map.top < planner.bottom && map.bottom > planner.top : null,
      horizontalOverflow: root.scrollWidth > root.clientWidth || document.body.scrollWidth > root.clientWidth,
      navigationPaddingBottom: nav ? getComputedStyle(document.querySelector('.mobile-navigation')!).paddingBottom : null,
    },
  };
}
