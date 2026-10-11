import type { DemoRoute } from '@/lib/route-scoring';
import { usableAutomaticSunlight } from '@/lib/solar-ranking';

export function AutomaticSunlightDetails({ route }: { route: DemoRoute }) {
  const result = route.automaticSunlight?.result;
  if (!result) return null;
  const usable = usableAutomaticSunlight(route);
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  return <section className="route-research-details" data-testid="automatic-sunlight-details" aria-label="Automatic sunlight prediction">
    <h3>Automatic sunlight · historical terrain model</h3>
    <p data-testid="sunlight-ranking-policy">{usable
      ? 'Used in experimental ranking with your Sunlight importance and acceptance settings.'
      : 'Incomplete model coverage: not used in ranking. Missing coverage is not shade.'}</p>
    <p>Potential direct sun: {result.value === null
      ? `${percent(result.sunlitFractionBounds[0])}–${percent(result.sunlitFractionBounds[1])}`
      : percent(result.value)} · {result.modeledSunlitMinutesBounds.map(v => v.toFixed(1)).join('–')} min</p>
    <p>Model coverage: {percent(result.coverageFraction)} · not a prediction-accuracy percentage.</p>
    <p>Departure: {new Date(result.departureAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} (UIUC time)</p>
    <p>Historical winter terrain, 2019–2020. Clear-sky potential, not current shade, clouds, heat, UV, comfort or safety.</p>
    <details><summary>Model assumptions and limitations</summary>
      <p>Constant walking speed; full route shape and exact duration. Shape, duration or departure changes trigger recalculation.</p>
      <ul>{result.limitations.map(text => <li key={text}>{text}</li>)}</ul>
      <p>{result.boundsMeaning}. The research file remains rankingEligible=false because it is not field validated;
        iSense separately uses complete model results under its experimental recommendation policy.</p>
    </details>
  </section>;
}
