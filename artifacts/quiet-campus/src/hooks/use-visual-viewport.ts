import { useEffect } from 'react';

/** Safari's keyboard resizes the visual viewport, not necessarily 100dvh. */
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
    let width = window.innerWidth;
    let fullHeight = window.innerHeight;
    let frame = 0;
    const sync = () => {
      if (Math.abs(window.innerWidth - width) > 2) {
        width = window.innerWidth;
        fullHeight = window.innerHeight;
      } else fullHeight = Math.max(fullHeight, window.innerHeight);
      const height = viewport?.height ?? window.innerHeight;
      const editing = document.activeElement?.matches(
        'input:not([type="range"]):not([type="radio"]):not([type="checkbox"]),textarea,[contenteditable="true"]',
      ) ?? false;
      root.style.setProperty('--isense-visual-viewport-height', `${height}px`);
      root.style.setProperty('--isense-visual-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      root.dataset.keyboardVisible = String(simulatedKeyboard || (editing && fullHeight - height > 100));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    sync();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      root.style.removeProperty('--isense-visual-viewport-height');
      root.style.removeProperty('--isense-visual-viewport-top');
      delete root.dataset.keyboardVisible;
      if (simulatedLargeText) root.style.fontSize = previousFontSize;
    };
  }, []);
}
