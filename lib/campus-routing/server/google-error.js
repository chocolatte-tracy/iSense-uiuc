import { RoutingError } from '../src/routing.js';

// Google ErrorInfo reason codes only. Never forward raw messages/metadata:
// they can contain keys, request URLs or account information.
export function classifiedGoogleError(status, body) {
  const reasons = Array.isArray(body?.error?.details)
    ? body.error.details.map(detail => detail?.reason).filter(reason => typeof reason === 'string') : [];
  const categories = [
    [['API_KEY_INVALID'], 'GOOGLE_INVALID_KEY', 'Google reports an invalid server API key.', 502],
    [['SERVICE_DISABLED', 'API_DISABLED'], 'GOOGLE_API_DISABLED', 'Google reports Routes API disabled for this key project.', 502],
    [['API_KEY_SERVICE_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED'],
      'GOOGLE_KEY_RESTRICTION', 'Google reports incompatible server-key API/application restrictions.', 502],
    [['BILLING_DISABLED', 'BILLING_NOT_ACTIVE'], 'GOOGLE_BILLING_DISABLED', 'Google reports billing disabled for this project.', 502],
    [['RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED'], 'GOOGLE_QUOTA_EXCEEDED', 'Google reports a quota/rate limit. No automatic retry.', 429],
  ];
  for (const [matching, code, message, httpStatus] of categories) {
    if (reasons.some(reason => matching.includes(reason))) return new RoutingError(code, message, httpStatus);
  }
  if (status === 403) return new RoutingError('GOOGLE_PERMISSION_ERROR',
    'Google denied Routes access without a recognized reason code. API enablement, restrictions and billing need separate manual verification; the specific cause is unconfirmed.', 502);
  return null;
}
