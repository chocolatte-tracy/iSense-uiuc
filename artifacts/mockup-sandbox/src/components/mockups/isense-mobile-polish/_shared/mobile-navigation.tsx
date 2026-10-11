import { Map, Route, SlidersHorizontal } from 'lucide-react';
type AppScreen = 'map'|'preferences'|'routes';

const items = [
  { screen:'map', label:'Map', Icon:Map },
  { screen:'preferences', label:'Preferences', Icon:SlidersHorizontal },
  { screen:'routes', label:'Routes', Icon:Route },
] as const;

export function MobileNavigation({screen,navigate}:{screen:AppScreen;navigate:(screen:AppScreen)=>void}) {
  return <nav className="mobile-navigation" aria-label="Campus walk sections">
    {items.map(({screen:target,label,Icon})=><button key={target} type="button"
      aria-current={screen===target?'page':undefined} data-testid={`nav-${target}`}
      onClick={()=>navigate(target)}><Icon size={19} aria-hidden="true"/><span>{label}</span></button>)}
    {/* Replit’s existing feedback control floats in this reserved utility footprint. */}
    <span className="nav-utility-spacer" aria-hidden="true"/>
  </nav>;
}
