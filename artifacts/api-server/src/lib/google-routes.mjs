// Public map configuration only. All route requests use the teammate adapter.
export function routesEnabled() {
  return process.env.GOOGLE_ROUTES_API_ENABLED === 'true';
}
export function publicRoutingEnabled() {
  return process.env.GOOGLE_ROUTES_PUBLIC_ENABLED === 'true';
}
export function serverRoutesKey() {
  return process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_ROUTES_API_KEY;
}
export function getPublicMapsConfig() {
  const browserApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_BROWSER_API_KEY;
  const mapsFlag = process.env.GOOGLE_MAPS_API_ENABLED;
  const enabled = mapsFlag === 'true' && Boolean(browserApiKey);
  const placesEnabled = process.env.GOOGLE_PLACES_API_ENABLED === 'true' && Boolean(browserApiKey);
  const routesReady = routesEnabled() && Boolean(serverRoutesKey());
  const defaults = {
    ROUTING_MAX_PER_MINUTE: 3, ROUTING_MAX_PER_DAY: 10, ROUTING_MAX_TOTAL: 20,
    ROUTING_MAX_CONCURRENT: 1, ROUTING_BUDGET_CENTS: 100,
    ROUTING_REQUEST_RESERVE_CENTS: 0,
  };
  const budgetConfigurationIssues = Object.entries(defaults).flatMap(([key, fallback]) => {
    const value = Number(process.env[key] ?? fallback);
    return Number.isSafeInteger(value) && value > 0 ? [] : [`${key} must be an explicitly configured positive integer.`];
  });
  const limitsReady = budgetConfigurationIssues.length === 0;
  const clientReady = (process.env.SESSION_SECRET?.length ?? 0) >= 32;
  const publicRoutesEnabled = routesReady && publicRoutingEnabled() && limitsReady && clientReady;
  const routingStatus = !routesEnabled() ? 'ROUTES_DISABLED' : !serverRoutesKey() ? 'MISSING_API_KEY'
    : !publicRoutingEnabled() ? 'PUBLIC_ROUTING_DISABLED' : !limitsReady ? 'BUDGET_NOT_CONFIGURED'
      : !clientReady ? 'CLIENT_SESSION_NOT_CONFIGURED' : 'READY_UNVERIFIED';
  const mapStatus = mapsFlag !== 'true' ? 'MAPS_DISABLED'
    : !browserApiKey ? 'BROWSER_KEY_MISSING' : 'READY_UNVERIFIED';
  const placesStatus = process.env.GOOGLE_PLACES_API_ENABLED !== 'true' ? 'PLACES_DISABLED'
    : !browserApiKey ? 'BROWSER_KEY_MISSING' : 'READY_UNVERIFIED';
  const routingMessage = !routesReady
    ? !routesEnabled() ? 'ROUTES_DISABLED: Live walking routes are switched off by the owner. Main Quad → Grainger demo remains available.'
      : 'MISSING_API_KEY: The server routing key is not configured. Demo remains available.'
    : !publicRoutingEnabled()
      ? 'PUBLIC_ROUTING_DISABLED: Public walking routes are switched off. The demo needs no access code.'
      : !limitsReady
        ? 'BUDGET_NOT_CONFIGURED: The owner must configure valid limits and a conservative cost reserve.'
        : !clientReady ? 'CLIENT_SESSION_NOT_CONFIGURED: Public client limits require a server session secret of at least 32 characters.'
          : 'Live routes are configured, not live-tested. Explicit requests remain subject to shared limits; Google may return fewer alternatives.';
  return {
    integrationVersion: 'places-new-v1',
    enabled,
    placesEnabled,
    routesEnabled: routesReady,
    publicRoutesEnabled,
    mapStatus, placesStatus, routingStatus,
    browserKeyPresent: Boolean(browserApiKey),
    routingKeyPresent: Boolean(serverRoutesKey()),
    clientLimitsConfigured: clientReady,
    budgetConfigured: limitsReady,
    budgetConfigurationIssues,
    routingMessage,
    message: enabled ? 'Map display configured, not live-tested; Cloud authorization may still fail.'
      : `${mapStatus}: ${mapStatus === 'MAPS_DISABLED'
        ? mapsFlag === undefined
          ? 'GOOGLE_MAPS_API_ENABLED is not configured. Map display remains off pending owner approval.'
          : 'GOOGLE_MAPS_API_ENABLED is not exactly true. Map display is switched off by the owner.'
        : 'The browser key is missing.'} Route cards remain available.`,
    placesMessage: placesEnabled ? 'Search UIUC and nearby Urbana-Champaign. Select a suggestion to confirm coordinates.'
      : `${placesStatus}: ${placesStatus === 'PLACES_DISABLED' ? 'Google address search is switched off by the owner.' : 'The browser key is missing.'} Campus choices remain available.`,
    ...((enabled || placesEnabled) ? { browserApiKey } : {}),
  };
}
