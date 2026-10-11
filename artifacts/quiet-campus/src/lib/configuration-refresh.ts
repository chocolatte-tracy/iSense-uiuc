type VisibilitySource = EventTarget & { visibilityState: string };

// Only the app's non-billable configuration endpoint is loaded. No polling,
// Google requests, route requests or changes to the user's trip/preferences.
export function watchConfiguration<T>(
  sources: { window: EventTarget; document: VisibilitySource },
  load: (signal: AbortSignal) => Promise<T>,
  onLoaded: (value: T) => void,
  onUnavailable: () => void,
) {
  let stopped = false;
  let active: AbortController | undefined;
  const refresh = () => {
    if (stopped || active || sources.document.visibilityState === 'hidden') return;
    const controller = new AbortController();
    active = controller;
    void load(controller.signal).then(value => {
      if (!stopped && !controller.signal.aborted) onLoaded(value);
    }, () => {
      if (!stopped && !controller.signal.aborted) onUnavailable();
    }).finally(() => {
      if (active === controller) active = undefined;
    });
  };
  const events = ['focus', 'online', 'pageshow'];
  for (const event of events) sources.window.addEventListener(event, refresh);
  sources.document.addEventListener('visibilitychange', refresh);
  refresh();
  return () => {
    stopped = true;
    active?.abort();
    for (const event of events) sources.window.removeEventListener(event, refresh);
    sources.document.removeEventListener('visibilitychange', refresh);
  };
}
