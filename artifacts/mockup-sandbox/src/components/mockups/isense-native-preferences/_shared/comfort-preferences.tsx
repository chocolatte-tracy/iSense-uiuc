import { acceptanceLimits, type AcceptanceKey, type AcceptanceLevel, type PreferenceWeights } from './route-scoring';
import { comfortFactors, comfortLevels, comfortOptions, comfortRangeNotes } from './sensory-comfort';

export function ComfortPreferences({ preferences, onChange }: {
  preferences: PreferenceWeights;
  onChange: (key: AcceptanceKey, value: AcceptanceLevel) => void;
}) {
  return (
    <section className="comfort-preferences" aria-labelledby="comfort-title">
      <h3 id="comfort-title">Sensory Comfort Preferences</h3>
      <p className="section-subtitle">Choose what environments feel comfortable to you.</p>
      <p className="preference-help">Cutoffs of 33, 66, and 100 are prototype index thresholds—not validated real-world exposure measurements.</p>
      <p className="preference-help">Trial ranges below explain what each choice accepts; they do not replace the prototype ranking cutoffs. Unknown cannot confirm comfort. Empty needs reviewed occupancy, not a zero monthly report. “No Limit” is not a safety guarantee.</p>
      {comfortFactors.map(factor => {
        const selected = preferences[factor.key];
        const helpId = `comfort-help-${factor.key}`;
        return (
          <fieldset className="acceptance-control" key={factor.key} aria-describedby={helpId}>
            <legend>{factor.title}</legend>
            <div className="acceptance-options">
              {comfortLevels.map(level => (
                <label key={level}>
                  <input type="radio" name={factor.key} value={level}
                    data-testid={`acceptance-${factor.key}-${level}`}
                    checked={selected === level}
                    onChange={() => onChange(factor.key, level)} />
                  <span className="comfort-option-content">
                    <span className="comfort-option-title">{comfortOptions[factor.key][level].label}</span>
                    <span className="comfort-option-range" data-testid={`acceptance-range-${factor.key}-${level}`}>
                      {comfortRangeNotes[factor.key][level].range}
                    </span>
                    <span className="comfort-option-levels">{comfortRangeNotes[factor.key][level].levels}</span>
                  </span>
                </label>
              ))}
            </div>
            <p id={helpId}>{comfortOptions[factor.key][selected].description} Prototype cutoff: ≤{acceptanceLimits[selected]}/100.</p>
          </fieldset>
        );
      })}
    </section>
  );
}
