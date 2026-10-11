import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MapScreen } from '@/components/map-screen';
import { PreferencesScreen } from '@/components/preferences-screen';
import { RoutesScreen } from '@/components/routes-screen';
import { ReportsScreen } from '@/components/reports-screen';
import { MobileNavigation } from '@/components/mobile-navigation';
import { InstallISense } from '@/components/install-isense';
import { ObservationImport } from '@/components/observation-import';
import { LayoutDiagnostics } from '@/components/layout-diagnostics';
import { useTripPlanner } from '@/hooks/use-trip-planner';
import { useAppNavigation } from '@/hooks/use-app-navigation';
import { useSavedPreferences } from '@/hooks/use-saved-preferences';
import { useSunContext } from '@/hooks/use-sun-context';
import { useVisualViewport } from '@/hooks/use-visual-viewport';
import { parseObservationDataset } from '@/lib/campus-observations';
import bundledObservations from '@/data/campus-observations.json';
import { WALKING_WARNING } from '@workspace/campus-routing/routing';
import { applySunContext, rankRoutes } from '@/lib/route-scoring';
import { UIUC_SUN_LOCATION } from '@/lib/sun-context';
import { installationEnvironment } from '@/lib/pwa-environment';
import { useCommunityReports } from '@/hooks/use-community-reports';
import { useAutomaticSunlight } from '@/hooks/use-automatic-sunlight';

function App() {
  useVisualViewport();
  const [observations,setObservations]=useState(()=>parseObservationDataset(bundledObservations));
  const [helpOpen,setHelpOpen]=useState(false);
  const [standalone,setStandalone]=useState(()=>installationEnvironment({
    userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,
    displayStandalone:window.matchMedia('(display-mode: standalone)').matches,
    appleStandalone:(navigator as Navigator&{standalone?:boolean}).standalone,
    embedded:window.top!==window.self,
  }).installed);
  const helpDialogRef=useRef<HTMLElement>(null);
  const priorFocus=useRef<HTMLElement|null>(null);
  const [helpMessage,setHelpMessage]=useState('');
  const [selectedRouteId,setSelectedRouteId]=useState<string|null>(null);
  const [pendingReportPoint,setPendingReportPoint]=useState<[number,number]|null>(null);
  const [reportPicking,setReportPicking]=useState(false);
  const [reportFormReopenKey,setReportFormReopenKey]=useState(0);
  const [locationSearching,setLocationSearching]=useState(false);
  const setLocationSearchMode=useCallback((searching:boolean)=>setLocationSearching(searching),[]);
  const {screen,navigate}=useAppNavigation();
  const communityReports=useCommunityReports(screen==='reports'||screen==='map');
  useEffect(()=>{setHelpOpen(false);},[screen]);
  const {preferences,setPreferences,lockedWeights,setLockedWeights,storageAvailable}=useSavedPreferences();
  const planner=useTripPlanner(observations);
  const {origin,destination,changeEndpoint,swapEndpoints,useMyLocation,locating,locationMessage,
    validation,tripKey,availableRoutes,routesEnabled,browserApiKey,mapMessage,places,routeStatus,loadingRoutes,
    fetchRoutes,online,hasSearched}=planner;
  const solarPoint=origin.place?.coordinates??availableRoutes[0]?.coordinates[0];
  const {context:sunContext,simulated}=useSunContext(solarPoint
    ?{latitude:solarPoint[0],longitude:solarPoint[1]}:UIUC_SUN_LOCATION);
  const sunlight=useAutomaticSunlight(availableRoutes,sunContext.departureTime);
  const contextualRoutes=useMemo(()=>sunlight.routes.map(route=>applySunContext(route,sunContext)),[sunlight.routes,sunContext]);

  useEffect(()=>{
    if(!import.meta.env.DEV)return;
    const params=new URLSearchParams(window.location.search);
    if(params.get('preview')!=='demo')return;
    const root=document.documentElement;
    const landscape=params.get('safeArea')==='iphone-landscape';
    if(params.get('safeArea')==='iphone'||landscape){
      root.style.setProperty('--isense-safe-area-top',landscape?'0px':'59px');
      root.style.setProperty('--isense-safe-area-right',landscape?'59px':'0px');
      root.style.setProperty('--isense-safe-area-bottom',landscape?'21px':'34px');
      root.style.setProperty('--isense-safe-area-left',landscape?'59px':'0px');
    }
    if(params.get('keyboard')==='on')root.style.setProperty('--isense-dev-keyboard-inset','280px');
    return()=>{
      root.style.removeProperty('--isense-safe-area-top');
      root.style.removeProperty('--isense-safe-area-right');
      root.style.removeProperty('--isense-safe-area-bottom');
      root.style.removeProperty('--isense-safe-area-left');
      root.style.removeProperty('--isense-dev-keyboard-inset');
    };
  },[]);
  useEffect(()=>{setSelectedRouteId(null);},[tripKey]);
  useEffect(()=>{
    if(!helpOpen)return;
    priorFocus.current=document.activeElement as HTMLElement;
    helpDialogRef.current?.querySelector<HTMLElement>('button,summary')?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setHelpOpen(false);return;}
      if(event.key!=='Tab'||!helpDialogRef.current)return;
      const nodes=[...helpDialogRef.current.querySelectorAll<HTMLElement>('button,a,input,select,summary,[tabindex]:not([tabindex="-1"])')].filter(node=>!node.hasAttribute('disabled')&&node.getClientRects().length>0);
      if(!nodes.length)return;
      if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}
    };
    window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('keydown',onKey);priorFocus.current?.focus();};
  },[helpOpen]);
  useEffect(()=>{
    const media=window.matchMedia('(display-mode: standalone)');
    let installedHere=false;
    const sync=()=>setStandalone(installationEnvironment({
      userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,
      displayStandalone:media.matches,appleStandalone:(navigator as Navigator&{standalone?:boolean}).standalone,
      embedded:window.top!==window.self,
    }).installed||installedHere);
    media.addEventListener?.('change',sync);
    const installed=()=>{installedHere=true;setStandalone(true);};
    window.addEventListener('appinstalled',installed);
    return()=>{media.removeEventListener?.('change',sync);window.removeEventListener('appinstalled',installed);};
  },[]);
  const rankedRoutes=useMemo(()=>rankRoutes(sunlight.routes,preferences,sunContext),[sunlight.routes,preferences,sunContext]);
  const fastest=availableRoutes.length?Math.min(...availableRoutes.map(route=>route.walkingTimeMinutes)):0;
  const selected=rankedRoutes.find(route=>route.id===selectedRouteId)??contextualRoutes.find(route=>route.id===selectedRouteId
    &&route.walkingTimeMinutes-fastest<=preferences.maxExtraWalkingMinutes)??rankedRoutes[0];

  const findRoutes=async()=>{
    setSelectedRouteId(null);
    const gotRoutes=await fetchRoutes();
    if(gotRoutes)navigate('routes');
  };
  const applyPreferences=()=>{
    setHelpMessage('Preferences applied to route comparisons. No route request was made.');
    navigate(availableRoutes.length?'routes':'map');
    window.setTimeout(()=>setHelpMessage(''),4500);
  };
  return <div className="app-shell">
    <header className="topbar" inert={locationSearching}>
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="iSense home" onClick={event=>{event.preventDefault();navigate('map');}}>
        <span className="brand-mark"><img src={`${import.meta.env.BASE_URL}icons/isense-192.png`} alt="" width={31} height={31}/></span>
        <span>iSense</span><span className="phase-tag">UIUC</span>
      </a>
      <div className="topbar-note"><span className="status-dot"/> Sensory-aware campus walks</div>
    </header>
    {!online&&<div className="offline-message" role="status" data-testid="offline-message" inert={locationSearching}>
      You’re offline. Campus demo routes and preferences remain available. Live routing and map updates need a connection.</div>}
    <main className="page-content">
      {!storageAvailable&&<div className="offline-message" role="status">Device storage is unavailable. Your preferences work in this session but cannot be remembered after reopening.</div>}
      <MapScreen active={screen==='map'} browserApiKey={browserApiKey} mapMessage={mapMessage} places={places} routes={availableRoutes} selectedRoute={selected}
        origin={origin} destination={destination} changeEndpoint={changeEndpoint} swapEndpoints={swapEndpoints}
        useMyLocation={useMyLocation} locating={locating} locationMessage={locationMessage} validation={validation}
        loadingRoutes={loadingRoutes} routeStatus={routeStatus} onFindRoutes={()=>void findRoutes()}
        onSearchModeChange={setLocationSearchMode} onHelp={()=>setHelpOpen(true)}
        reports={communityReports.reports} reportPicking={reportPicking}
        onReportPointSelected={(point:[number,number])=>{setPendingReportPoint(point);setReportPicking(false);setReportFormReopenKey(value=>value+1);navigate('reports');}}
        onCancelReportPick={()=>{setReportPicking(false);setReportFormReopenKey(value=>value+1);navigate('reports');}}/>
      <PreferencesScreen active={screen==='preferences'} preferences={preferences} setPreferences={setPreferences}
        lockedWeights={lockedWeights} setLockedWeights={setLockedWeights} onApply={applyPreferences}
        onViewRoutes={()=>navigate('routes')}/>
      <RoutesScreen active={screen==='routes'} hasSearched={hasSearched} routes={contextualRoutes}
        sunlightMessage={sunlight.message} sunlightPending={sunlight.pending}
        ranked={rankedRoutes} preferences={preferences} sunContext={sunContext} originName={origin.place?.name??origin.text}
        destinationName={destination.place?.name??destination.text} validation={validation}
        selectedId={selectedRouteId} onSelect={setSelectedRouteId} onGoMap={()=>navigate('map')}
        onChangePreferences={()=>navigate('preferences')}/>
      <ReportsScreen active={screen==='reports'} reports={communityReports.reports} storage={communityReports.storage}
        loading={communityReports.loading} error={communityReports.error} refresh={()=>communityReports.refresh()}
        submit={communityReports.submit} submitting={communityReports.submitting} pendingPoint={pendingReportPoint}
        onClearPoint={()=>setPendingReportPoint(null)} onPickOnMap={()=>{setReportPicking(true);navigate('map');}}
        mapAvailable={Boolean(browserApiKey)} onFormReopenKey={reportFormReopenKey}/>
      {helpMessage&&<div className="inline-status" role="status">{helpMessage}</div>}
      <footer className="page-footer"><span>iSense · UIUC sensory-aware route research</span>
        <span>Routes are planning candidates, not an accessibility check. Verify conditions before walking.</span></footer>
    </main>
     <InstallISense active={screen==='map'&&!locationSearching}/>
     {!locationSearching&&<MobileNavigation screen={screen} navigate={navigate}/>}
    {helpOpen&&<div className="help-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setHelpOpen(false);}}>
      <section ref={helpDialogRef} className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title" tabIndex={-1}>
        <div className="help-dialog-head"><h2 id="help-dialog-title">About iSense</h2>
          <button className="help-close" type="button" aria-label="Close help" onClick={()=>setHelpOpen(false)}><X size={19}/></button></div>
        <p>iSense compares campus walking candidates using your sensory preferences. It is a planning aid, not an accessibility assessment or a live report of conditions.</p>
        <details><summary>Routing status and limitations</summary>
          <p className="route-request-note" role="status">{routeStatus}</p>
          <p className="route-request-note">{routesEnabled
            ?'Live routing is available when configured. Requests happen only after you choose Find routes.'
            :'Live routing is awaiting separate approval. Changing preferences does not request a route.'}</p>
          <p className="route-request-note">{WALKING_WARNING}</p>
          <p className="route-request-note">Unknown endpoints are not guessed. Device-reported positions are used only in this tab and sent for routing only after you explicitly search.</p>
        </details>
        <LayoutDiagnostics/>
        <details><summary>Research and imported observations</summary>
          <p>Observation values are research estimates and may include demonstration data. Review source notes and candidate limitations before relying on a route.</p>
          <ObservationImport data={observations} routes={availableRoutes} onChange={setObservations}/>
        </details>
        <details><summary>Privacy</summary><p>Preferences and locks are saved only on this device, not on a server. Geolocation and imported observations are never persisted.</p></details>
        {!standalone&&<details><summary>Install help</summary><p>On iPhone or iPad, open iSense in Safari, choose Share, then Add to Home Screen. In a supported desktop or Android browser, use the browser’s Install app option when offered. Some in-app browsers do not support installation. The invitation can be dismissed and these instructions remain here.</p>
        </details>}
      </section>
    </div>}
  </div>;
}

export default App;
