import {useState} from 'react';
import {PreferencesScreen} from './_shared/preferences-screen';
import {MobileNavigation} from './_shared/mobile-navigation';
import {initialPreferences,type WeightKey} from './_shared/route-scoring';
import './_group.css';
export function Current(){
const [preferences,setPreferences]=useState({...initialPreferences});
const [lockedWeights,setLockedWeights]=useState<WeightKey[]>([]);
const navigate=(_screen?:'map'|'preferences'|'routes')=>{};
return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="iSense home" onClick={event=>{event.preventDefault();navigate('map');}}>
        <span className="brand-mark"><img src={`${import.meta.env.BASE_URL}images/isense-native-before.png`} alt="" width={31} height={31}/></span>
        <span>iSense</span><span className="phase-tag">UIUC</span>
      </a>
      <div className="topbar-note"><span className="status-dot"/> Sensory-aware campus walks</div>
    </header>
<main className="page-content"><PreferencesScreen active preferences={preferences} setPreferences={setPreferences} lockedWeights={lockedWeights} setLockedWeights={setLockedWeights} onApply={navigate} onViewRoutes={navigate}/></main><MobileNavigation screen="preferences" navigate={navigate}/></div>;
}
