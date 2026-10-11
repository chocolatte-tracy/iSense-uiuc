export class GoogleServiceError extends Error {
  constructor(public readonly code: string, message: string) { super(`${code}: ${message}`); }
}

// Only known categories are displayed. Never echo an upstream URL/key/body.
export function googleServiceError(error: unknown, service = 'Places'): GoogleServiceError {
  if (error instanceof GoogleServiceError) return error;
  const detail = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  const text = [detail?.code, detail?.status, detail?.message].filter(v => typeof v === 'string').join(' ');
  for (const code of ['RefererNotAllowedMapError', 'ApiNotActivatedMapError', 'InvalidKeyMapError',
    'BillingNotEnabledMapError', 'ClientBillingNotEnabledMapError', 'API_KEY_INVALID', 'PERMISSION_DENIED',
    'REQUEST_DENIED', 'OVER_QUERY_LIMIT', 'RESOURCE_EXHAUSTED']) {
    if (text.includes(code)) return new GoogleServiceError(code,
      `${service} rejected the request. Check this exact category in Google Cloud. Campus choices remain available; no automatic retry.`);
  }
  if (/network|failed to fetch|fetch failed/i.test(text)) return new GoogleServiceError('NETWORK_ERROR',
    `${service} could not reach Google. Check your connection; try again manually.`);
  return new GoogleServiceError('GOOGLE_SERVICE_UNAVAILABLE',
    `${service} is unavailable. Use campus choices. Cloud permissions have not been verified.`);
}
