import {useState} from 'react';
import {MapScreen} from './_shared/map-screen';
import {MobileNavigation} from './_shared/mobile-navigation';
import {EnvironmentContext} from './_shared/environment-context';
import {campusLocations,locationField} from './_shared/campus-locations';
import './_group.css';
export function Current(){const [origin,setOrigin]=useState(()=>locationField(campusLocations[0]!));const [destination,setDestination]=useState(()=>locationField(campusLocations[1]!));const navigate=(_screen?:'map'|'preferences'|'routes')=>{};return <div className='app-shell'>
    <header className="topbar">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="iSense home" onClick={event=>{event.preventDefault();navigate('map');}}>
        <span className="brand-mark"><img src={`/__mockup/images/isense-before-polish.png`} alt="" width={31} height={31}/></span>
        <span>iSense</span><span className="phase-tag">UIUC</span>
      </a>
      <div className="topbar-note"><span className="status-dot"/> Sensory-aware campus walks</div>
    </header>
<EnvironmentContext context={{phase:'nighttime',sunrise:new Date('2026-10-10T11:59:16Z'),sunset:new Date('2026-10-10T23:22:50Z'),departureTime:new Date('2026-10-10T05:00:00Z'),localDate:'2026-10-10'}} simulated={false}/><main className='page-content'><MapScreen active routes={[]} origin={origin} destination={destination} changeEndpoint={(side,field)=>side==='origin'?setOrigin(field):setDestination(field)} swapEndpoints={()=>{setOrigin(destination);setDestination(origin);}} useMyLocation={()=>{}} locating={false} locationMessage='' validation={null} loadingRoutes={false} routeStatus='Choose two locations, then find routes.' mapMessage='MAPS_DISABLED: Map display is not enabled. Route cards remain available.' onFindRoutes={()=>{}} onHelp={()=>{}}/></main><MobileNavigation screen='map' navigate={navigate}/></div>;}
