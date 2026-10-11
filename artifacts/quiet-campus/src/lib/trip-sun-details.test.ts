import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { calculateSunContext } from './sun-context';
import { demoRoutes } from './demo-routes';
import { applySunContext, initialPreferences, rankRoutes } from './route-scoring';

test('route detail UI renders estimates for every route path without changing ranking', async () => {
  // Vite loads the real components, JSX, aliases and CSS without opening a port,
  // launching a browser, or enabling any Google service.
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    base: '/',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
    esbuild: { jsx: 'automatic' },
    resolve: { alias: { '@': fileURLToPath(new URL('..', import.meta.url)) } },
  });
  try {
    const { RoutesScreen } = await server.ssrLoadModule('/src/components/routes-screen.tsx');
    const { RouteSunTransitionNotice } = await server.ssrLoadModule('/src/components/route-sun-transition-notice.tsx');
    const day = calculateSunContext(new Date('2026-10-10T17:00:00Z'));
    const renderNotice = (sunContext: ReturnType<typeof calculateSunContext> | undefined, route = demoRoutes[0]) =>
      renderToStaticMarkup(createElement(RouteSunTransitionNotice, { route, sunContext }));
    const renderRoutes = (sunContext: ReturnType<typeof calculateSunContext>, preferences = initialPreferences) => {
      const routes = demoRoutes.map(route => applySunContext(route, sunContext));
      const ranked = rankRoutes(demoRoutes, preferences, sunContext);
      return renderToStaticMarkup(createElement(RoutesScreen, {
        active: true, hasSearched: true, routes, ranked, preferences, sunContext,
        originName: 'Main Quad', destinationName: 'Grainger',
        validation: null, selectedId: ranked[0]?.id ?? null,
        onSelect: () => {}, onGoMap: () => {}, onChangePreferences: () => {},
      }));
    };
    for (const kind of ['sunrise', 'sunset'] as const) {
      const context = calculateSunContext(new Date(day[kind]!.getTime() - 300_000));
      const html = renderRoutes(context);
      assert.match(html, new RegExp(`${kind === 'sunrise' ? 'Sunrise' : 'Sunset'} may occur during your walk`));
      assert.match(html, /Oct 10, 2026.*CDT/);
      assert.match(html, /Scoring still uses departure-time conditions/);
      assert.match(html, /No segment-by-segment shade, weather, lighting or safety observations/);
      const recommendedId = rankRoutes(demoRoutes, initialPreferences, context)[0].id;
      // The native screen shows one essential summary, not three duplicated
      // notices. Each candidate retains the complete notice in its details.
      assert.ok(html.includes(`data-testid="trip-sun-${recommendedId}" data-status="available"`));
      assert.equal(html.split(`data-testid="trip-sun-${recommendedId}"`).length - 1, 1);
      for (const route of demoRoutes) {
        const details = renderNotice(context, route);
        assert.ok(details.includes(`data-testid="trip-sun-${route.id}" data-status="available"`));
        assert.match(details, /Scoring still uses departure-time conditions/);
        assert.match(details, /No segment-by-segment shade, weather, lighting or safety observations/);
        assert.ok(html.includes(route.name));
      }
    }
    const sunset = calculateSunContext(new Date(day.sunset!.getTime() - 300_000));
    const outsideTime = renderRoutes(sunset, { ...initialPreferences, maxExtraWalkingMinutes: 0 });
    assert.match(outsideTime, /routes-outside-time-limit/);
    for (const route of demoRoutes) assert.ok(outsideTime.includes(route.name));
    const outsideComfort = renderRoutes(sunset, { ...initialPreferences, noiseAcceptance: 'low' });
    assert.match(outsideComfort, /outside your comfort limits/);
    for (const route of demoRoutes) assert.ok(outsideComfort.includes(route.name));
    const nearSunset = calculateSunContext(new Date(day.sunset!.getTime() - 12 * 60_000));
    assert.match(renderNotice(nearSunset, { ...demoRoutes[0], walkingTimeMinutes: 9 }), /No sunrise or sunset is estimated/);
    assert.match(renderNotice(nearSunset, { ...demoRoutes[0], walkingTimeMinutes: 14 }), /Sunset may occur during your walk/);
    const midnight = renderNotice(calculateSunContext(new Date('2026-10-10T23:55:00-05:00')),
      { ...demoRoutes[0], walkingTimeMinutes: 20 });
    assert.match(midnight, /Oct 10, 2026/);
    assert.match(midnight, /Oct 11, 2026/);
    for (const departure of ['2026-03-08T01:55:00-06:00', '2026-11-01T01:55:00-05:00']) {
      const dst = renderNotice(calculateSunContext(new Date(departure)), { ...demoRoutes[0], walkingTimeMinutes: 10 });
      assert.match(dst, /CST/);
      assert.match(dst, /CDT/);
      assert.match(dst, /No sunrise or sunset is estimated/);
    }
    assert.match(renderNotice(day), /No sunrise or sunset is estimated within this walk/);
    assert.match(renderNotice(undefined), /crossing estimate unavailable.*valid departure time/);
    assert.match(renderNotice(day, { ...demoRoutes[0], walkingTimeMinutes: NaN }), /walking-time estimate is missing or unsupported/);
    assert.match(renderNotice(calculateSunContext(day.departureTime, { latitude: NaN, longitude: 0 })),
      /Local solar-event estimates are unavailable/);
  } finally {
    await server.close();
  }
});
