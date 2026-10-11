import reference from '../data/historical-sensory-reference.json';
import { classifyNoise, physicalThresholds } from '../lib/physical-sensory-levels';

export function SensoryLevelGuide() {
  const { noise, crowds } = physicalThresholds;
  return <details className="sensory-level-guide" data-testid="sensory-level-guide">
    <summary>What do Low, Medium, High and Unknown mean?</summary>
    <p><strong>Trial physical ranges, not route scores.</strong> These are initial product boundaries, not medical safety limits or validated UIUC standards.</p>
    <div className="sensory-range-columns">
      <section aria-label="Noise trial ranges"><h4>Noise · dB(A)</h4><ul>
        <li><strong>Low:</strong> below {noise.lowUpperDbA} dB(A)</li>
        <li><strong>Medium:</strong> {noise.lowUpperDbA} to below {noise.mediumUpperDbA} dB(A)</li>
        <li><strong>High:</strong> {noise.mediumUpperDbA} dB(A) or above</li>
        <li><strong>Unknown:</strong> missing or unusable measurements</li>
      </ul><p>WHO’s outdoor 50/55 dB(A) annoyance guidance uses approximately 16-hour LAeq. Short observations do not establish compliance. Measurement duration is not invented; dB values are not averaged arithmetically.</p></section>
      <section aria-label="Crowd trial ranges"><h4>Crowds · people/m²</h4><ul>
        <li><strong>Empty:</strong> reviewed observation confirms zero people</li>
        <li><strong>Low:</strong> above 0 to below {crowds.lowUpperPeoplePerM2}</li>
        <li><strong>Medium:</strong> {crowds.lowUpperPeoplePerM2} to below {crowds.mediumUpperPeoplePerM2}</li>
        <li><strong>High:</strong> {crowds.mediumUpperPeoplePerM2} or above</li>
        <li><strong>Unknown:</strong> missing occupancy, area, time or quality</li>
      </ul><p>Density = people present at the same time ÷ usable walking area. Simplified from FHWA walkway space guidance, not a universal sensory tolerance standard. Flow counts are not occupancy.</p></section>
    </div>
    <p><strong>Acceptance vs importance:</strong> Low accepts Low (and verified Empty for crowds); Medium accepts Low and Medium; High accepts all known levels, not guaranteed safety. Unknown never confirms comfort. Importance determines contribution to ranking.</p>
    <p><strong>Current ranking is unchanged:</strong> 33/66/100 remain prototype index cutoffs, not dB(A) or people/m². Physical ranges are explanatory only until time, quality and route coverage are reviewed.</p>
    <details className="historical-reference" data-testid="historical-reference">
      <summary>Historical source examples · NOT this route’s conditions</summary>
      <p><strong>Historical / partial location coverage.</strong> {reference.noise.recordCount} NoiseCapture observations cover approximately {reference.noise.footprintMeters.width} × {reference.noise.footprintMeters.height} m near UIUC, not a full route. Observed {reference.noise.timeRange.startLocal}–{reference.noise.timeRange.endLocal} ({reference.noise.timeRange.localTimeZone}). None of these examples is linked to the displayed routes.</p>
      <p>{reference.noise.selection} Phone calibration is not independently verified.</p>
      <ul>{reference.noise.examples.map(sample => {
        const classification = classifyNoise({ ...sample, source: sample.sourceUrl, quality: 'source-reported' });
        return <li key={sample.id}>
          <strong>Historical · {classification.level}</strong> — {sample.noiseDb} dB(A), {sample.noiseMetric}<br />
          <time dateTime={sample.observedAt}>{sample.observedAtOriginal}</time> · {sample.latitude}, {sample.longitude}<br />
          <a href={sample.sourceUrl} target="_blank" rel="noreferrer">Source: {sample.sourceType}</a>
        </li>;
      })}</ul>
      <p><strong>Historical traffic, current density Unknown.</strong> {reference.crowds.recordCount} monthly reports, {reference.crowds.periodMonthRange.start}–{reference.crowds.periodMonthRange.end}. Counts are not unique people or current occupancy. Missing months are not filled; multiple reports for one month must not be summed. Equipment warnings can affect later rows without repeated notes.</p>
      <ul>{reference.crowds.examples.map(report => <li key={report.id}>
        <strong>{report.locationName} · Historical / density Unknown</strong><br />
        Original reported value: {report.sourceValueOriginal} ({report.sourceUnit}); monthly traffic report, not people/m².<br />
        Applicable date: <time dateTime={report.applicableDate}>{report.applicableDate}</time>; exact measurement interval unknown.<br />
        {report.locationScope === 'multiple_counters'
          ? 'Combined counters: no invented single-point coordinate.'
          : `Published marker: ${report.latitude}, ${report.longitude}; not full-route coverage.`}<br />
        {report.reportedCount === 0 && <><strong>Zero does not mean Empty; quality review required.</strong><br /></>}
        {report.sourceAnnotation && <>Source annotation: {report.sourceAnnotation}<br /></>}
        {report.qualityFlags.length > 0 && <>Quality flags: {report.qualityFlags.join(', ')}<br /></>}
        <a href={report.sourceUrl} target="_blank" rel="noreferrer">Source: UIUC iCAP metric {report.sourceMetricId}</a>
      </li>)}</ul>
    </details>
    <p className="sensory-reference-links">References: <a href="https://www.who.int/publications/i/item/a68672" target="_blank" rel="noreferrer">WHO community noise</a> · <a href="https://www.fhwa.dot.gov/publications/research/safety/pedbike/98107/section3.cfm" target="_blank" rel="noreferrer">FHWA pedestrian guidance</a>. Keep attribution; public download availability does not establish redistribution permission.</p>
  </details>;
}
