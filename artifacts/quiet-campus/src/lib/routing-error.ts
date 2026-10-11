export function routingFailureMessage(status: number | null, body: unknown): string {
  const detail = body && typeof body === 'object' ? body as { error?: unknown } : null;
  const error = detail?.error;
  const message = typeof error === 'string' ? error
    : error && typeof error === 'object' && 'message' in error ? error.message : null;
  // Both existing adapters' sanitized formats are supported; never stringify a response.
  if (typeof message === 'string' && message.trim()) return message;
  if (status === 429) return 'Live routing is limited by request or budget safeguards. No automatic retry was made. Try later or ask the app owner to check the limits.';
  if (status === 503) return 'Live routing is currently unavailable. Approval, configuration and routing budget must be checked before retrying.';
  return 'Route search failed. Check your connection and routing settings.';
}
