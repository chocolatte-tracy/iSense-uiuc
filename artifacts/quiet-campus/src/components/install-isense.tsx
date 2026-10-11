import { useEffect, useRef, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { installationEnvironment, canOfferInstallation } from '@/lib/pwa-environment';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome:'accepted'|'dismissed' }>;
}
const DISMISS_KEY='isense-install-invitation-dismissed';
const environmentNow=()=>installationEnvironment({
  userAgent:navigator.userAgent, platform:navigator.platform, maxTouchPoints:navigator.maxTouchPoints,
  displayStandalone:window.matchMedia('(display-mode: standalone)').matches,
  appleStandalone:(navigator as Navigator&{standalone?:boolean}).standalone, embedded:window.top!==window.self,
});
function wasDismissed() { try { return window.localStorage.getItem(DISMISS_KEY)==='1'; } catch { return false; } }

export function InstallISense({ active = true }: { active?: boolean }) {
  const [environment,setEnvironment]=useState(environmentNow);
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const [dismissed,setDismissed]=useState(wasDismissed);
  const [installedThisSession,setInstalledThisSession]=useState(false);
  const installedThisSessionRef=useRef(false);
  const [installing,setInstalling]=useState(false);
  const [notice,setNotice]=useState('');
  const [helpOpen,setHelpOpen]=useState(false);
  useEffect(()=>{ if(!active)setHelpOpen(false); },[active]);
  const [registrationFailed,setRegistrationFailed]=useState(false);
  const dialogRef=useRef<HTMLElement>(null);
  const previousFocus=useRef<HTMLElement|null>(null);
  const {needRefresh:[needRefresh,setNeedRefresh],offlineReady:[offlineReady],updateServiceWorker}=useRegisterSW({
    onRegisterError:()=>setRegistrationFailed(true),
  });

  useEffect(()=>{
    let promptCaptured=false;
    const capture=(event:Event)=>{
      if(promptCaptured)return;
      promptCaptured=true;
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const sync=()=>setEnvironment(environmentNow());
    const onInstalled=()=>{installedThisSessionRef.current=true;setInstalledThisSession(true);setHelpOpen(false);setPrompt(null);setEnvironment(environmentNow());};
    const media=window.matchMedia('(display-mode: standalone)');
    const onHelp=()=>{if(!environmentNow().installed&&!installedThisSessionRef.current){setHelpOpen(true);}};
    window.addEventListener('beforeinstallprompt',capture);
    window.addEventListener('appinstalled',onInstalled);
    window.addEventListener('isense-install-help',onHelp);
    media.addEventListener?.('change',sync);
    return()=>{
      window.removeEventListener('beforeinstallprompt',capture);
      window.removeEventListener('appinstalled',onInstalled);
      window.removeEventListener('isense-install-help',onHelp);
      media.removeEventListener?.('change',sync);
    };
  },[]);
  useEffect(()=>{
    if(!helpOpen)return;
    previousFocus.current=document.activeElement as HTMLElement;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setHelpOpen(false);return;}
      if(event.key!=='Tab'||!dialogRef.current)return;
      const focusable=[...dialogRef.current.querySelectorAll<HTMLElement>('button,a,[tabindex]:not([tabindex="-1"])')].filter(node=>!node.hasAttribute('disabled')&&node.getClientRects().length>0);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('keydown',onKey);previousFocus.current?.focus();};
  },[helpOpen]);
  const dismiss=()=>{
    setDismissed(true);
    try{window.localStorage.setItem(DISMISS_KEY,'1');}catch{/* storage may be unavailable */}
  };
  const install=async()=>{
    if(!prompt||!canOfferInstallation(environment,true)||installing)return;
    setInstalling(true);
    try{
      await prompt.prompt();
      const result=await prompt.userChoice;
      setNotice(result.outcome==='accepted'?'Install request accepted. Follow your browser’s confirmation.':'Installation was dismissed. You can try again from Help.');
    }catch{setNotice('Your browser could not open installation. Use its install option if available.');}
    finally{setInstalling(false);setPrompt(null);}
  };
  const update=async()=>{
    try{await updateServiceWorker(true);}catch{setNotice('Update could not load. Please reconnect and try again.');}
  };
  const canShowBanner=!environment.installed&&!environment.embedded&&!dismissed&&!installedThisSession
    &&(environment.ios||environment.android||prompt!==null);
  const shouldShowInstallButton=canOfferInstallation(environment,prompt!==null);
  const instructions=environment.ios
    ?<ol data-testid="ios-install-instructions"><li>Open the published iSense link in <strong>Safari</strong>.</li>
      <li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li>
      <li>Keep the name iSense, tap <strong>Add</strong>, then open its home-screen icon.</li></ol>
    :environment.android
      ?<ol data-testid="android-install-instructions"><li>Open the published iSense link in Chrome.</li>
        <li>Choose <strong>Install iSense</strong> when offered, or use the browser menu’s <strong>Add to Home screen</strong>.</li>
        <li>Confirm, then launch iSense from its icon. Wording varies by browser.</li></ol>
      :<p data-testid="other-install-instructions">In Chrome or Edge, use the browser menu’s <strong>Install app</strong> option when available. On iPhone or iPad use Safari → Share → Add to Home Screen. Some browsers and in-app previews do not support installation.</p>;

  return <>
    {active&&canShowBanner&&<aside className="install-invitation" aria-label="Install iSense">
      <div className="install-invitation-copy"><span className="install-invitation-icon"><Smartphone size={18}/></span>
        <div><strong>Take iSense with you.</strong><span>Add it to your Home Screen for easy access.</span></div></div>
      <div className="install-invitation-actions">
        {shouldShowInstallButton?<button className="pwa-action" type="button" onClick={()=>void install()} disabled={installing}
          data-testid="install-isense"><Download size={15}/>{installing?'Opening…':'Install'}</button>
          :<button className="pwa-action" type="button" onClick={()=>setHelpOpen(true)}>How to install</button>}
        <button className="install-dismiss" type="button" aria-label="Dismiss installation invitation"
          onClick={dismiss}><X size={17}/></button>
      </div>
    </aside>}
    {helpOpen&&!environment.installed&&!installedThisSession&&<div className="help-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setHelpOpen(false);}}>
      <section ref={dialogRef} className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
        <div className="help-dialog-head"><h2 id="install-help-title"><Smartphone size={18}/> Install iSense</h2>
          <button className="help-close" type="button" aria-label="Close installation help" onClick={()=>setHelpOpen(false)}><X size={19}/></button></div>
        <p>A home-screen shortcut opens the same campus-walk tools.</p>
        {environment.embedded&&<p>Installation is unavailable inside this preview. Open the published iSense URL directly in your browser.</p>}
        {instructions}
        {shouldShowInstallButton&&<button className="pwa-action" type="button" onClick={()=>void install()} disabled={installing}>
          <Download size={15}/>{installing?'Opening installation…':'Install iSense'}</button>}
        {notice&&<p role="status">{notice}</p>}
        {!window.isSecureContext&&<p className="pwa-note">Installation requires HTTPS (localhost is a browser testing exception).</p>}
        <p className="pwa-note">Offline demo comparisons need a first online visit. Live routes, map updates and Google Maps navigation need a connection.</p>
      </section>
    </div>}
    {import.meta.env.DEV&&!environment.installed&&<span className="sr-only">Development preview: installation and offline caching are enabled in production builds.</span>}
    {offlineReady&&<span className="sr-only" role="status">App assets are ready for offline demo use—not offline live routing.</span>}
    {registrationFailed&&<span className="sr-only" role="status">Offline setup is unavailable in this browser.</span>}
    {notice&&!helpOpen&&<span className="sr-only" role="status">{notice}</span>}
    {needRefresh&&<aside className="pwa-update-floating" role="status">
      <p>A new iSense version is ready. Reloading resets this tab’s trip and imported observations.</p>
      <button className="pwa-action" type="button" onClick={()=>void update()} data-testid="update-isense">Update &amp; reload</button>
      <button className="pwa-action pwa-secondary" type="button" onClick={()=>setNeedRefresh(false)}>Not now</button>
    </aside>}
  </>;
}
