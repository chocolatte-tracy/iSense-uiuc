import { useRef, useState } from 'react';
import './research-prediction-tools.css';
import type { DemoRoute } from '@/lib/route-scoring';
import type { SunContext } from '@/lib/sun-context';
import { exportPredictionRoutes, importPredictionResult, routeSnapshotKey, type ResearchPrediction } from '@/lib/research-prediction';

export function ResearchPredictionTools({ route, sunContext }: { route: DemoRoute; sunContext?: SunContext }) {
  // Remount on shape/duration changes, even when the provider reuses a route ID.
  if (route.source !== 'google') return null;
  return <SnapshotTools key={routeSnapshotKey(route)} route={route} sunContext={sunContext}/>;
}

function SnapshotTools({ route, sunContext }: { route: DemoRoute; sunContext?: SunContext }) {
  const [result, setResult] = useState<ResearchPrediction | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef(0);
  const download = async () => {
    setBusy(true); setMessage('');
    try {
      if (!sunContext) throw new Error('Departure time is unavailable.');
      const payload = await exportPredictionRoutes([route], sunContext.departureTime);
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'isense-route-request.json';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Route exported. Run the offline model, then import its result here.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Export failed.'); }
    finally { setBusy(false); }
  };
  const importFile = async (file: File) => {
    const token = ++operation.current;
    setBusy(true); setResult(null); setMessage('');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Prediction file exceeds 8 MB.');
      const parsed = await importPredictionResult(JSON.parse(await file.text()), route);
      if (token === operation.current) setResult(parsed);
    } catch (error) {
      if (token === operation.current) setMessage(error instanceof SyntaxError ? 'Invalid JSON file.' : error instanceof Error ? error.message : 'Import failed.');
    } finally { if (token === operation.current) setBusy(false); }
  };
  const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
  return <details className="route-research-details research-prediction-tools" data-testid="research-prediction-tools">
    <summary>Offline sunlight research</summary>
    <p>Optional manual export/import for research. These imported files stay separate from route ranking.
      Automatic model results used by iSense are shown above.</p>
    <button type="button" className="native-details-button" disabled={busy || !sunContext} onClick={download}>Export route for offline prediction</button>
    <p><label>Import offline prediction JSON <input type="file" accept=".json,application/json" disabled={busy}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }}/></label></p>
    {message && <p role="status">{message}</p>}
    {result && <section aria-label="Imported research prediction">
      <h3>Historical terrain model · not live conditions</h3>
      <p>Snapshot departure: {new Date(result.departureAt).toLocaleString('en-US', { timeZone: 'America/Chicago', timeZoneName: 'short' })}.
        This snapshot does not update with the clock.</p>
      <p>Modeled direct sunlight: {percent(result.sunlitFractionBounds[0])}–{percent(result.sunlitFractionBounds[1])} of route length
        ({result.modeledSunlitMinutesBounds.map(v => v.toFixed(1)).join('–')} minutes assuming constant walking speed).</p>
      <p>Model coverage: {percent(result.coverageFraction)}. Unknown support: {percent(result.lengthsMeters.unknown / result.totalRouteLengthMeters)}.
        Nighttime length is counted separately from shade.</p>
      <p>Bounds represent missing terrain support, not a confidence interval. This uses winter 2019–2020 LiDAR, a 300 m search radius and a 1.5 m receiver height.
        It does not model clouds, leaf transparency, temperature or UV and has not been field validated.</p>
      <p>Imported local research file; route matching does not authenticate its source. Not used for comfort cutoffs or ranking.</p>
    </section>}
  </details>;
}
