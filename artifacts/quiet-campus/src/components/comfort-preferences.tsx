import { Info } from 'lucide-react';
import { acceptanceLimits, type AcceptanceKey, type AcceptanceLevel, type PreferenceWeights } from '@/lib/route-scoring';
import { comfortFactors, comfortLevels } from '@/lib/sensory-comfort';

const labels: Record<AcceptanceKey, Record<AcceptanceLevel,string>> = {
  noiseAcceptance:{low:'Very quiet',medium:'Quiet',high:'Any noise'},
  crowdAcceptance:{low:'Very few',medium:'Some people',high:'Any crowd'},
  sunAcceptance:{low:'Minimal sun',medium:'Some sun',high:'Any sunlight'},
};

export function ComfortPreferences({ preferences, onChange, onInfo }: {
  preferences: PreferenceWeights;
  onChange: (key: AcceptanceKey, value: AcceptanceLevel) => void;
  onInfo?: (key: AcceptanceKey) => void;
}) {
  return <section className="comfort-preferences native-comfort" aria-label="Comfort acceptance settings">
    {comfortFactors.map(factor => {
      const selected = preferences[factor.key];
      const caption = factor.title === 'Sun Exposure' ? 'Sunlight' : factor.title;
      return <div className="acceptance-control native-acceptance-row" key={factor.key}
        role="group" aria-labelledby={`acceptance-caption-${factor.key}`}>
        <div className="acceptance-caption-row">
          <span id={`acceptance-caption-${factor.key}`} className="acceptance-caption">{caption}</span>
          {onInfo && <button className="acceptance-info-button" type="button"
            aria-label={`About ${caption} comfort limit`} onClick={() => onInfo(factor.key)}>
            <Info size={15} aria-hidden="true"/>
          </button>}
        </div>
        <div className="acceptance-options">
          {comfortLevels.map(level => <label key={level}>
            <input type="radio" name={factor.key} value={level}
              data-testid={`acceptance-${factor.key}-${level}`}
              checked={selected === level} onChange={() => onChange(factor.key, level)}
              aria-label={`${factor.title} acceptance: ${labels[factor.key][level]} (${level}, cutoff ${acceptanceLimits[level]} of 100)`}/>
            <span>{labels[factor.key][level]}</span>
          </label>)}
        </div>
      </div>;
    })}
  </section>;
}
