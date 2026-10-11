import { useEffect } from 'react';
import { keyboardViewport } from '@/lib/viewport-layout';
import { syncStandaloneViewport, type ViewportReachability } from '@/lib/viewport-measurement';

/** CSS owns the app viewport; VisualViewport is used only for a focused keyboard. */
export function useVisualViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const params = new URLSearchParams(window.location.search);
    const simulatedLargeText = import.meta.env.DEV && params.get('preview') === 'demo'
      && params.get('textScale') === '2';
    const previousFontSize = root.style.fontSize;
    if (simulatedLargeText) root.style.fontSize = '200%';
    const simulatedKeyboard = import.meta.env.DEV && params.get('preview') === 'demo'
      && params.get('keyboard') === 'on';
    // Measure the CSS viewport itself: innerHeight/clientHeight can disagree with
    // dvh in Safari. This is invisible, zero-width and never creates a spacer.
    const probe = document.createElement('div');
    probe.dataset.isenseViewportProbe = '';
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {
      position: 'fixed', top: '0', left: '0', width: '0', visibility: 'hidden',
      pointerEvents: 'none', height: 'var(--isense-viewport-height)',
    });
    document.body.append(probe);
    const displayMode = window.matchMedia('(display-mode: standalone)');
    let frame = 0;
    let reachability: ViewportReachability = null;
    const clearKeyboard = () => {
      root.style.removeProperty('--isense-keyboard-height');
      root.style.removeProperty('--isense-keyboard-top');
      root.dataset.keyboardVisible = String(simulatedKeyboard);
    };
    const sync = () => {
      const standalone = displayMode.matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      root.dataset.displayMode = standalone ? 'standalone' : 'browser';
      if (document.hidden) { clearKeyboard(); return; }
      const editing = document.activeElement?.matches(
        'input:not([type="range"]):not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="color"]):not([type="hidden"]),textarea,[contenteditable="true"]',
      ) ?? false;
      reachability = syncStandaloneViewport({
        standalone, editing, visualHeight: viewport?.height, scale: viewport?.scale, previous: reachability,
      });
      const keyboard = keyboardViewport({
        layoutHeight: probe.getBoundingClientRect().height,
        visualHeight: viewport?.height, offsetTop: viewport?.offsetTop, scale: viewport?.scale, editing,
      });
      clearKeyboard();
      if (keyboard) {
        root.style.setProperty('--isense-keyboard-height', `${keyboard.height}px`);
        root.style.setProperty('--isense-keyboard-top', `${keyboard.top}px`);
        root.dataset.keyboardVisible = 'true';
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    const resume = () => { clearKeyboard(); reachability = null; schedule(); };
    sync();
    const observer = new ResizeObserver(schedule);
    observer.observe(probe);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('orientationchange', resume);
    displayMode.addEventListener?.('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('orientationchange', resume);
      displayMode.removeEventListener?.('change', schedule);
      observer.disconnect();
      probe.remove();
      clearKeyboard();
      root.style.removeProperty('--isense-viewport-height');
      delete root.dataset.keyboardVisible;
      delete root.dataset.displayMode;
      delete root.dataset.viewportUnits;
      delete root.dataset.viewportPolicy;
      delete root.dataset.viewportCandidateReachable;
      if (simulatedLargeText) root.style.fontSize = previousFontSize;
    };
  }, []);
}
