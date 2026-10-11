import { loadBrowserGrid } from './solar-grid';
import { predictBrowserSunlight } from './solar-model';
import { exportPredictionRoutes } from './research-prediction';
import type { DemoRoute } from './route-scoring';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ routes: DemoRoute[]; departureAt: string; gridUrl: string }>) => void) | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    const response = await fetch(data.gridUrl, { credentials: 'same-origin', cache: 'force-cache' });
    if (!response.ok) throw new Error('Historical terrain unavailable. Sunlight remains unknown.');
    const grid = await loadBrowserGrid(await response.arrayBuffer());
    const results = [];
    for (const route of data.routes) {
      try {
        const request = await exportPredictionRoutes([route], new Date(data.departureAt));
        results.push({ id: route.id, result: predictBrowserSunlight(request.routes[0], grid) });
      } catch {
        results.push({ id: route.id, error: 'This route cannot be evaluated by the historical model.' });
      }
    }
    scope.postMessage({ results });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'Sunlight prediction failed.' });
  }
};
