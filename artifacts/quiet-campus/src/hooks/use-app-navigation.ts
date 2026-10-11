import { useCallback, useEffect, useState } from 'react';
import { resolveAppScreen, type AppScreen } from '@/lib/app-state';

export function useAppNavigation() {
  const [screen, setScreen] = useState<AppScreen>(() => resolveAppScreen(window.location.hash));
  useEffect(() => {
    const sync = () => {
      const next = resolveAppScreen(window.location.hash);
      if (window.location.hash !== `#${next}`) {
        const url = new URL(window.location.href);
        url.hash = next;
        window.history.replaceState(window.history.state, '', url);
      }
      setScreen(next);
    };
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  const navigate = useCallback((next: AppScreen) => {
    if (window.location.hash !== `#${next}`) {
      const url = new URL(window.location.href);
      url.hash = next;
      window.history.pushState(window.history.state, '', url);
    }
    setScreen(next);
  }, []);
  return { screen, navigate };
}
