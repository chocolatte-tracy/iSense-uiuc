import type { DemoRoute } from '@/lib/route-scoring';
import { sensorySummary } from '@/lib/campus-observations';

export function ObservationEvidence({ route }: { route: DemoRoute }) {
  const evidence = route.sensoryEvidence;
  return <details className="synthetic-note">
    <summary>{sensorySummary(route)}</summary>
    <p>Scores describe supplied observations at their dates, not live conditions or a guarantee of suitability. “Verified” means team-reviewed, not independently verified by iSense.</p>
    {evidence && <ul>{(['noise', 'crowds', 'sunlight'] as const).map(key => {
      const metric = evidence.metrics[key];
      return <li key={key}>{key}: {metric.status === 'demo' ? 'DEMO DATA' : metric.status} · {metric.verifiedPercent.toFixed(1)}% verified / {metric.estimatedPercent.toFixed(1)}% estimated / {metric.demoPercent.toFixed(1)}% DEMO DATA by path length.</li>;
    })}</ul>}
    {evidence?.observations.map(observation => <div key={observation.id}>
      <strong>{observation.id} · segment {observation.segmentId}</strong>
      <p>Observed: {observation.observedAt}<br />Source: {observation.source}<br />Conditions: {observation.conditions}</p>
      <ul>{(['noise', 'crowds', 'sunlight'] as const).map(key => {
        const metric = observation[key];
        if (!metric || !evidence.metrics[key].observationIds.includes(observation.id)) return null;
        return <li key={key}>{key}: {metric.value}/100 · {metric.status} · method: {metric.method}
          {metric.status === 'verified' && ` · reviewed by ${metric.reviewedBy} at ${metric.reviewedAt}`}</li>;
      })}</ul>
    </div>)}
    {(!evidence || evidence.observations.length === 0) && <p>No observations map to this path. Research candidate waypoints are not verified segment geometry.</p>}
  </details>;
}
