import { RoutingError, normalizeEndpoint } from '../src/routing.js';
import { computeWalkingRoutes } from './google-routes.js';

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new RoutingError('CONTENT_TYPE', 'Use application/json.', 415);
  if (Number(req.headers['content-length']) > 8192) throw new RoutingError('BODY_TOO_LARGE', 'Request is too large.', 413);
  // Supports Express after express.json(), or a plain Node IncomingMessage.
  if (req.body !== undefined) {
    if (JSON.stringify(req.body).length > 8192) throw new RoutingError('BODY_TOO_LARGE', 'Request is too large.', 413);
    return req.body;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8192) throw new RoutingError('BODY_TOO_LARGE', 'Request is too large.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RoutingError('INVALID_JSON', 'Request body must be valid JSON.'); }
}

/** Mount once, not per request. Defaults to deny unless the host authorizes requests.
 * Limits are process-wide and intentionally conservative for a hackathon demo.
 */
export function createRouteHandler({
  authorize = () => false, allowedOrigins = [], clientOptions = {},
  maxPerMinute = 20, maxTotalRequests = 200, maxConcurrent = 3,
  reserveBudget,
} = {}) {
  let windowStart = Date.now(), count = 0, total = 0, active = 0;
  return async function routeHandler(req, res) {
    let acquired = false;
    let releaseBudget;
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        throw new RoutingError('METHOD_NOT_ALLOWED', 'Use POST for walking routes.', 405);
      }
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) throw new RoutingError('ORIGIN_DENIED', 'This website is not allowed to use the routing proxy.', 403);
      if (!(await authorize(req))) throw new RoutingError('UNAUTHORIZED', 'A valid team routing access code is required. Ask the owner; demo routes remain available.', 401);
      if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); count = 0; }
      if (!reserveBudget && (count >= maxPerMinute || total >= maxTotalRequests || active >= maxConcurrent)) {
        throw new RoutingError('PROXY_LIMIT', 'Routing request limit reached. Wait before retrying or contact the owner; demo routes remain available.', 429);
      }
      count++;
      const input = await readBody(req);
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['origin', 'destination'].includes(k))) {
        throw new RoutingError('INVALID_INPUT', 'Send only origin and destination.');
      }
      normalizeEndpoint(input.origin);
      normalizeEndpoint(input.destination);
      // Recheck after asynchronous body reading so concurrent arrivals cannot exceed caps.
      if (reserveBudget) releaseBudget = await reserveBudget();
      else if (total >= maxTotalRequests || active >= maxConcurrent) throw new RoutingError('PROXY_LIMIT', 'Too many requests. Try again manually later.', 429);
      active++; total++; acquired = true;
      const result = await computeWalkingRoutes(input, clientOptions);
      sendJson(res, 200, result);
    } catch (error) {
      const safe = error instanceof RoutingError ? error : new RoutingError('INTERNAL_ERROR', 'The routing server encountered an error.', 500);
      if (!res.destroyed && !res.headersSent) sendJson(res, safe.status, { error: { code: safe.code, message: safe.message } });
    } finally {
      if (acquired) active--;
      // A failed release leaves a conservative lease until expiry, not a refund.
      if (releaseBudget) await releaseBudget().catch(() => {});
    }
  };
}
