import { useState } from 'react';
import { parseObservationDataset, emptyObservations, type ObservationDataset } from '@/lib/campus-observations';
import type { DemoRoute } from '@/lib/route-scoring';

function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ObservationImport({ data, routes, onChange }: {
  data: ObservationDataset;
  routes: DemoRoute[];
  onChange: (data: ObservationDataset) => void;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const live = routes.filter(route => route.source === 'google' && route.coordinates.length >= 2);
  return <details className="gentle-reminder" style={{ display: 'block' }}>
    <summary>Campus observations · {data.observations.length} records loaded</summary>
    <p>Import team JSON with dated sources and stable segment coordinates. This replaces the observation set for this tab only; reload restores the bundled file. Preferences and Google routes are unchanged. No Google request is made.</p>
    <p>Verified means team-reviewed. Estimates are separate; uncovered path lengths remain DEMO DATA. Nearby paths do not automatically match.</p>
    <p><a href={`${import.meta.env.BASE_URL}observation-guide.md`} download>Download format and collection guide</a></p>
    <label>Import observation JSON
      <input type="file" accept=".json,application/json" onChange={async event => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        try {
          if (file.size > 2_000_000) throw new Error('Use a JSON file smaller than 2 MB.');
          const next = parseObservationDataset(JSON.parse(await file.text()));
          onChange(next);
          setError(false);
          setMessage(`Loaded ${next.observations.length} observations for ${next.segments.length} segments. Check each route’s evidence coverage; unmatched geometry stays DEMO DATA.`);
        } catch (failure) {
          setError(true);
          setMessage(`Import rejected; previous observations kept. ${failure instanceof Error ? failure.message : 'Invalid JSON.'}`);
        } finally {
          input.value = '';
        }
      }} />
    </label>
    <p>
      <button type="button" onClick={() => downloadJson(emptyObservations, 'campus-observations.json')}>Download empty format</button>{' · '}
      <button type="button" disabled={!live.length} onClick={() => {
        // Export geometry only. Never invent observation values or provenance.
        const seen = new Set<string>();
        const segments = live.flatMap(route => {
          const geometry = JSON.stringify(route.coordinates);
          if (seen.has(geometry)) return [];
          seen.add(geometry);
          // Geometry-derived identifier, not a response-local route number.
          let hash = 2166136261;
          for (const character of geometry) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
          return [{ id: `path-${hash.toString(16)}`, name: `${route.originName} to ${route.destinationName} (review segment boundaries)`, direction: 'forward', path: route.coordinates }];
        });
        downloadJson({ version: 1, segments, observations: [] }, 'campus-segments.json');
      }}>Export loaded path geometry</button>{' · '}
      <button type="button" onClick={() => {
        onChange(emptyObservations);
        setError(false);
        setMessage('Observations cleared for this tab. All live sensory values now use the DEMO DATA placeholder.');
      }}>Clear observations</button>
    </p>
    <p>Exported Google paths are a starting point for defining segments, not evidence that observations have been collected. Split them at actual observation boundaries; retain the intervening coordinates.</p>
    {message && <p role={error ? 'alert' : 'status'}>{message}</p>}
  </details>;
}
