import { useState, type CSSProperties } from 'react';
import { Clock3, Info, LockKeyhole, MoreHorizontal, RotateCcw, SlidersHorizontal, Sun,
  UnlockKeyhole, UsersRound, VolumeX } from 'lucide-react';
import { ComfortPreferences } from '@/components/comfort-preferences';
import { DetailsSheet } from '@/components/details-sheet';
import { WalkingTimeLimit } from '@/components/walking-time-limit';
import { activePreferencePreset, applyPreferencePreset, preferencePresets } from '@/lib/preference-presets';
import {
  rebalanceWeights, resetPreferenceSettings, toggleWeightLock, weightAdjustmentLimits,
  type AcceptanceKey, type AcceptanceLevel, type PreferenceWeights, type WeightKey,
} from '@/lib/route-scoring';

const sliders = [
  { key:'avoidNoise', title:'Noise', icon:VolumeX, copy:'Lower estimated noise can rank higher.' },
  { key:'avoidCrowds', title:'Crowds', icon:UsersRound, copy:'Less crowded estimates can rank higher.' },
  { key:'preferShade', title:'Sunlight', icon:Sun, copy:'Lower estimated sun exposure can rank higher.' },
  { key:'prioritizeShortWalkingTime', title:'Walking time', icon:Clock3, copy:'Shorter estimated walks can rank higher.' },
] as const;

export function PreferencesScreen({ active, preferences, setPreferences, lockedWeights, setLockedWeights, onApply, onViewRoutes }:{
  active:boolean; preferences:PreferenceWeights; setPreferences:(next:PreferenceWeights|((current:PreferenceWeights)=>PreferenceWeights))=>void;
  lockedWeights:WeightKey[]; setLockedWeights:(next:WeightKey[]|((current:WeightKey[])=>WeightKey[]))=>void;
  onApply:()=>void; onViewRoutes:()=>void;
}) {
  const [walkingLimitReset,setWalkingLimitReset]=useState(0);
  const [infoKey,setInfoKey]=useState<WeightKey|AcceptanceKey|'maxExtraWalkingMinutes'|null>(null);
  const [toolsOpen,setToolsOpen]=useState(false);
  const updatePreference=(key:WeightKey|'maxExtraWalkingMinutes',value:number)=>{
    setPreferences(previous=>key==='maxExtraWalkingMinutes'
      ? {...previous,maxExtraWalkingMinutes:value}
      : rebalanceWeights(previous,key,value,lockedWeights));
  };
  const updateAcceptance=(key:AcceptanceKey,value:AcceptanceLevel)=>setPreferences(previous=>({...previous,[key]:value}));
  const reset=()=>{
    const resetState=resetPreferenceSettings();
    setPreferences(resetState.preferences); setLockedWeights(resetState.lockedWeights);
    setWalkingLimitReset(value=>value+1); setToolsOpen(false);
  };
  const total=sliders.reduce((sum,slider)=>sum+preferences[slider.key],0);
  const activePreset=activePreferencePreset(preferences);
  const selectedInfo=sliders.find(slider=>slider.key===infoKey);
  const acceptanceTitle=infoKey==='noiseAcceptance'?'Noise comfort limit':infoKey==='crowdAcceptance'?'Crowd comfort limit':infoKey==='sunAcceptance'?'Sunlight comfort limit':'';
  const infoTitle=infoKey==='maxExtraWalkingMinutes'?'Maximum extra walking time':selectedInfo?.title??acceptanceTitle;
  return <>
    <section className="app-screen preferences-screen" aria-label="Sensory preferences"
      aria-hidden={!active} hidden={!active} inert={!active}>
      <header className="native-screen-heading">
        <div><div className="eyebrow">YOUR ROUTE, YOUR PRIORITIES</div><h1>Preferences</h1></div>
        <button className="native-icon-button" type="button" aria-label="Preference tools" onClick={()=>setToolsOpen(true)}><MoreHorizontal size={21}/></button>
      </header>
      <div className="importance-heading"><span><SlidersHorizontal size={15}/> Importance</span>
        <output data-testid="value-total-weight">{total}% shared</output>
      </div>
      {lockedWeights.length>=3&&<p className="weight-lock-notice compact-lock-notice" role="status">
        {lockedWeights.length===4?'All shares are locked.':'The remaining unlocked share is fixed.'} Unlock shares to adjust.
      </p>}
      <div className="native-slider-list" aria-label="Sensory importance weights">
        {sliders.map(slider=>{
          const Icon=slider.icon; const value=preferences[slider.key];
          const limits=weightAdjustmentLimits(preferences,slider.key,lockedWeights);
          const locked=limits?.isLocked??false; const LockIcon=locked?LockKeyhole:UnlockKeyhole;
          return <div className={`native-slider-row${locked?' weight-is-locked':''}`} key={slider.key}>
            <span className="native-factor-icon"><Icon size={17}/></span>
            <button className="native-factor-help" type="button" aria-label={`About ${slider.title} importance and acceptance`}
              onClick={()=>setInfoKey(slider.key)}><span>{slider.title}</span><Info size={14}/></button>
            <input id={`slider-${slider.key}`} data-testid={`slider-${slider.key}`} type="range" min="0" max="100" step="1"
              value={value} disabled={limits?.disabled??false} style={{'--range-progress':`${value}%`} as CSSProperties}
              onChange={event=>updatePreference(slider.key,Number(event.target.value))}
              aria-label={`${slider.title} importance`} aria-valuetext={`${value} percent importance`}
              aria-describedby={`lock-help-${slider.key}`}/>
            <output className="slider-value" htmlFor={`slider-${slider.key}`} data-testid={`value-${slider.key}`}>{value}%</output>
            <button type="button" className="native-lock-button" data-testid={`lock-${slider.key}`}
              aria-pressed={locked} aria-label={`${locked?'Unlock':'Lock'} ${slider.title} importance`}
              onClick={()=>setLockedWeights(previous=>toggleWeightLock(previous,slider.key))}>
              <LockIcon size={17}/><span className="sr-only" id={`lock-help-${slider.key}`}>{locked?`Locked at ${value}%. Unlock to adjust.`:
                limits?.disabled?`Fixed at ${value}%. Unlock another share to adjust.`:'Lock this share; changing other shares balances the total.'}</span>
            </button>
          </div>;
        })}
      </div>
      <div className="native-acceptance-heading">Comfort limits <span>details on request</span></div>
      <ComfortPreferences preferences={preferences} onChange={updateAcceptance} onInfo={setInfoKey}/>
      <div className="native-extra-time">
        <span className="native-factor-icon"><Clock3 size={17}/></span>
        <button type="button" className="native-factor-help" onClick={()=>setInfoKey('maxExtraWalkingMinutes')}>
          <span>Max extra walking time</span><Info size={14}/>
        </button>
        <WalkingTimeLimit key={walkingLimitReset} value={preferences.maxExtraWalkingMinutes}
          onChange={value=>updatePreference('maxExtraWalkingMinutes',value)}/>
      </div>
      <div className="native-preference-actions">
        <button type="button" className="primary-screen-action" onClick={onApply} data-testid="button-apply-preferences">Apply</button>
        <button type="button" onClick={onViewRoutes}>View routes</button>
      </div>
    </section>
    <DetailsSheet title={infoTitle} open={infoKey!==null} ownerActive={active} onClose={()=>setInfoKey(null)}>
      {infoKey==='maxExtraWalkingMinutes'?<div className="native-info-copy">
        <p>This is a hard eligibility limit: routes above the fastest available estimate plus this many minutes are excluded.</p>
        <p>Walking Time Importance is different. It changes ranking among eligible routes. This limit does not change the importance weights.</p>
        <p>Times are estimates; actual pace and conditions vary. An invalid draft keeps the last valid limit in effect.</p>
      </div>:<div className="native-info-copy">
        <p><strong>Importance</strong> is this factor’s share of the 100% ranking balance. Locking preserves its share while other unlocked weights rebalance.</p>
        {infoKey==='prioritizeShortWalkingTime'
          ?<p><strong>Walking Time Importance</strong> ranks shorter estimates among eligible routes. It has no sensory acceptance setting. The separate maximum-extra-minutes input is a hard filter.</p>
          :<p><strong>Acceptance</strong> sets the existing prototype cutoff: Very quiet / Very few / Minimal sun = Low (33); middle choice = Medium (66); Any = High (100).</p>}
        <p>{selectedInfo?.copy} Both importance and acceptance affect which candidates are shown and ranked. No level guarantees literal silence, an empty path, or shade.</p>
        {infoKey==='preferShade'&&<p>Sun context uses estimated departure time and UIUC sunrise/sunset; at nighttime direct sun is excluded from scoring. Weather is not connected, and shade is not measured.</p>}
        <p>Noise and crowd values are research estimates, sometimes demonstration data—not live measurements. Unknown conditions cannot be confirmed comfortable.</p>
      </div>}
    </DetailsSheet>
    <DetailsSheet title="Preference tools" open={toolsOpen} ownerActive={active} onClose={()=>setToolsOpen(false)}>
      <p className="native-tools-description">Presets update unlocked weights using the existing balancing rules. Your saved settings stay on this device.</p>
      <div className="native-tool-presets">{preferencePresets.map(preset=><button key={preset.id} type="button"
        className="preset-button" aria-pressed={activePreset===preset.id} data-testid={`preset-${preset.id}`}
        onClick={()=>setPreferences(previous=>applyPreferencePreset(previous,preset.id,lockedWeights))}>{preset.name}</button>)}</div>
      <button type="button" className="reset-button" onClick={reset} data-testid="button-reset-preferences"><RotateCcw size={15}/> Reset preferences</button>
      <p className="native-tools-description">Reset restores importance defaults 40 / 30 / 20 / 10, clears locks, and restores the 5-minute extra-walk limit.</p>
    </DetailsSheet>
  </>;
}
