import { useEffect, useMemo, useState } from 'react';
import { calculateSunContext, nextSunRefreshDelay, solarPreviewTime, type SunLocation } from '@/lib/sun-context';

export function useSunContext(location: SunLocation) {
  const [simulation] = useState(() => solarPreviewTime(window.location.search, import.meta.env.DEV));
  const [now, setNow] = useState(() => simulation?.getTime() ?? Date.now());
  const context = useMemo(() => calculateSunContext(new Date(now), location),
    [now, location.latitude, location.longitude]);
  useEffect(() => {
    if (simulation) return;
    const refresh = () => setNow(Date.now());
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = window.setTimeout(refresh, nextSunRefreshDelay(context));
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [context, simulation]);
  return { context, simulated: simulation !== null };
}
