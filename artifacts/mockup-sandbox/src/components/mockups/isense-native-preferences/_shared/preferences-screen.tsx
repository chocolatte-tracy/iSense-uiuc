import { useState, type CSSProperties } from 'react';
import { Clock3, LockKeyhole, RotateCcw, ShieldCheck, SlidersHorizontal, Sun,
  UnlockKeyhole, UsersRound, VolumeX } from 'lucide-react';
import { ComfortPreferences } from './comfort-preferences';
import { WalkingTimeLimit } from './walking-time-limit';
import { activePreferencePreset, applyPreferencePreset, preferencePresets } from './preference-presets';
import {
  rebalanceWeights, resetPreferenceSettings, toggleWeightLock, weightAdjustmentLimits,
  type AcceptanceKey, type AcceptanceLevel, type PreferenceWeights, type WeightKey,
} from './route-scoring';

const sliders = [
  { key:'avoidNoise', title:'Noise', description:'Give quieter paths more weight.', icon:VolumeX, low:'Less important', high:'Very important' },
  { key:'avoidCrowds', title:'Crowds', description:'Give less crowded paths more weight.', icon:UsersRound, low:'Less important', high:'Very important' },
  { key:'preferShade', title:'Sun exposure', description:'Favor more shade when possible.', icon:Sun, low:'Less important', high:'Very important' },
  { key:'prioritizeShortWalkingTime', title:'Shorter walk', description:'Favor a shorter estimated walk.', icon:Clock3, low:'Less important', high:'Very important' },
] as const;

export function PreferencesScreen({ active, preferences, setPreferences, lockedWeights, setLockedWeights, onApply, onViewRoutes }:{
  active:boolean; preferences:PreferenceWeights; setPreferences:(next:PreferenceWeights|((current:PreferenceWeights)=>PreferenceWeights))=>void;
  lockedWeights:WeightKey[]; setLockedWeights:(next:WeightKey[]|((current:WeightKey[])=>WeightKey[]))=>void;
  onApply:()=>void; onViewRoutes:()=>void;
}) {
  const [walkingLimitReset,setWalkingLimitReset]=useState(0);
  const updatePreference=(key:WeightKey|'maxExtraWalkingMinutes',value:number)=>{
    setPreferences(previous=>key==='maxExtraWalkingMinutes'
      ? {...previous,maxExtraWalkingMinutes:value}
      : rebalanceWeights(previous,key,value,lockedWeights));
  };
  const updateAcceptance=(key:AcceptanceKey,value:AcceptanceLevel)=>setPreferences(previous=>({...previous,[key]:value}));
  const reset=()=>{
    const resetState=resetPreferenceSettings();
    setPreferences(resetState.preferences); setLockedWeights(resetState.lockedWeights);
    setWalkingLimitReset(value=>value+1);
  };
  const activePreset=activePreferencePreset(preferences);
  const total=sliders.reduce((sum,slider)=>sum+preferences[slider.key],0);
  return <section className="app-screen preferences-screen" aria-label="Sensory preferences"
    aria-hidden={!active} hidden={!active} inert={!active}>
    <header className="screen-heading">
      <div><div className="eyebrow">MAKE THE WALK YOURS</div><h1>Preferences</h1>
        <p>Adjust what matters. You can search without changing anything.</p></div>
    </header>
    <div className="compact-presets" aria-label="Preference presets">
      {preferencePresets.map(preset=><button key={preset.id} type="button" className="preset-button"
        aria-pressed={activePreset===preset.id} data-testid={`preset-${preset.id}`}
        onClick={()=>setPreferences(previous=>applyPreferencePreset(previous,preset.id,lockedWeights))}>{preset.name}</button>)}
    </div>
    <section className="preferences-card card" aria-label="Detailed route preferences">
      <div className="section-heading"><div><div className="eyebrow">OPTIONAL DETAIL</div><h2>Fine-tune your walk</h2></div>
        <span className="heading-icon"><SlidersHorizontal size={18}/></span></div>
      <p className="section-subtitle">Importance changes how candidates are ranked. Comfort acceptance limits are separate. Updates are local and do not request routes.</p>
      <div className="weight-total"><span>Total importance</span><output data-testid="value-total-weight">{total}%</output></div>
      <p className="preference-help">All four shares total 100%. Lock a share to keep it fixed; changing another balances unlocked values.</p>
      {lockedWeights.length>=3&&<p className="weight-lock-notice" role="status">
        {lockedWeights.length===4?'All shares are locked. Unlock at least two to adjust the balance.':'The last unlocked share is fixed by the remaining percentage. Unlock another share to adjust.'}
      </p>}
      <div className="slider-list">
        {sliders.map(slider=>{
          const Icon=slider.icon; const value=preferences[slider.key];
          const limits=weightAdjustmentLimits(preferences,slider.key,lockedWeights);
          const locked=limits?.isLocked??false; const LockIcon=locked?LockKeyhole:UnlockKeyhole;
          return <div className={`slider-item${locked?' weight-is-locked':''}`} key={slider.key}>
            <div className="slider-topline"><div className="slider-title-wrap"><span className="slider-icon"><Icon size={16}/></span>
              <div><label htmlFor={`slider-${slider.key}`} className="slider-title">{slider.title}</label><p>{slider.description}</p></div></div>
              <div className="slider-actions"><output className="slider-value" htmlFor={`slider-${slider.key}`} data-testid={`value-${slider.key}`}>{value}%</output>
                <button type="button" className="weight-lock-button" data-testid={`lock-${slider.key}`}
                  aria-pressed={locked} aria-label={`${locked?'Unlock':'Lock'} ${slider.title} importance`}
                  onClick={()=>setLockedWeights(previous=>toggleWeightLock(previous,slider.key))}>
                  <LockIcon size={13}/><span>{locked?'Locked':'Lock'}</span></button></div></div>
            <input id={`slider-${slider.key}`} data-testid={`slider-${slider.key}`} type="range" min="0" max="100" step="1"
              value={value} disabled={limits?.disabled??false} style={{'--range-progress':`${value}%`} as CSSProperties}
              onChange={event=>updatePreference(slider.key,Number(event.target.value))}
              aria-valuetext={`${value} percent importance`} aria-describedby={`lock-help-${slider.key}`}/>
            <div className="range-labels"><span>{slider.low}</span><span>{slider.high}</span></div>
            <p className="weight-lock-help" id={`lock-help-${slider.key}`}>{locked?`Locked at ${value}%. Unlock to change this share.`
              :limits?.disabled?`Fixed at ${value}%. Unlock another share to adjust.`:'Lock this share to keep it unchanged.'}</p>
          </div>;
        })}
        <WalkingTimeLimit key={walkingLimitReset} value={preferences.maxExtraWalkingMinutes}
          onChange={value=>updatePreference('maxExtraWalkingMinutes',value)}/>
      </div>
      <ComfortPreferences preferences={preferences} onChange={updateAcceptance}/>
      <button type="button" className="reset-button" onClick={reset} data-testid="button-reset-preferences">
        <RotateCcw size={14}/> Reset preferences</button>
      <div className="gentle-reminder"><ShieldCheck size={19}/><p><strong>Private to this device.</strong><br/>Preferences and locks are saved on this device, not sent to a server. Location and imported observations are never persisted.</p></div>
    </section>
    <div className="screen-actions">
      <button type="button" className="primary-screen-action" onClick={onApply}>Apply preferences</button>
      <button type="button" onClick={onViewRoutes}>View routes</button>
    </div>
  </section>;
}
