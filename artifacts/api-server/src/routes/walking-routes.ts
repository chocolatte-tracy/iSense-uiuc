import { Router } from "express";
import { FetchWalkingRoutesBody } from "@workspace/api-zod";
import { createRouteHandler, sendJson, type ClientOptions, type RouteRequest } from "@workspace/campus-routing/proxy";
import { routesEnabled, publicRoutingEnabled, serverRoutesKey } from "../lib/google-routes.mjs";
import { authorizeTeamRouting } from "../lib/team-routing-access";
import { createPostgresBudget, type DurableBudget } from "../lib/routing-budget";
import { isPublicCampusTrip, createPublicPeerLimiter } from "../lib/public-routing";
import { createPublicClientLimiter } from "../lib/public-client";

export function allowedPreviewOrigins(): string[] {
  const hosts = [process.env.REPLIT_DEV_DOMAIN, ...(process.env.REPLIT_DOMAINS || "").split(",")].filter(Boolean);
  const origins = [...hosts.map(host => `https://${host}`), ...(process.env.ALLOWED_ORIGINS || "").split(",")];
  return [...new Set(origins.map(value => value.trim()).filter(value => {
    try { return new URL(value).origin === value && /^https?:/.test(value); } catch { return false; }
  }))];
}

// Public access is a separate owner opt-in; private mode retains team authorization.
// Neither mode bypasses Google approval, input validation or durable cost accounting.
export function createCampusRouteHandler(options: {
  allowedOrigins?: string[];
  enabled?: () => boolean;
  publicEnabled?: () => boolean;
  clientOptions?: ClientOptions;
  teamToken?: string;
  clientSecret?: string;
  budget?: DurableBudget;
} = {}) {
  const origins = options.allowedOrigins ?? allowedPreviewOrigins();
  const enabled = options.enabled ?? routesEnabled;
  const publicEnabled = options.publicEnabled ?? publicRoutingEnabled;
  const allowPeer = createPublicPeerLimiter();
  const clientSecret = options.clientSecret ?? process.env.SESSION_SECRET ?? '';
  const allowClient = createPublicClientLimiter(clientSecret);
  const clientOptions = options.clientOptions ?? { apiKey: serverRoutesKey() };
  const publicRequests = new WeakSet<RouteRequest>();
  const budget = options.budget ?? createPostgresBudget();
  const adapter = createRouteHandler({
    allowedOrigins: origins,
    authorize: req => typeof req.headers.origin === "string" && origins.includes(req.headers.origin)
      && (publicRequests.has(req) || authorizeTeamRouting(req, options.teamToken)),
    clientOptions: { ...clientOptions, timeoutMs: 12000 },
    reserveBudget: () => budget.reserve(),
  });
  const router = Router();
  router.post("/walking-routes", async (req, res) => {
    if (!enabled()) {
      sendJson(res, 503, { error: { code: "ROUTES_DISABLED", message: "Live routing is awaiting separate approval. Demo routes remain available." } });
      return;
    }
    const publicMode = publicEnabled();
    if (!clientOptions.apiKey?.trim()) {
      sendJson(res, 503, { error: { code: "MISSING_API_KEY", message: "The server routing key is missing. No Google request or cost reservation was made." } });
      return;
    }
    if (publicMode && clientSecret.length < 32) {
      sendJson(res, 503, { error: { code: "CLIENT_SESSION_NOT_CONFIGURED", message: "Public routing client limits require a server session secret of at least 32 characters." } });
      return;
    }
    if (publicMode && (
      typeof req.headers.origin !== "string" || !origins.includes(req.headers.origin)
      || req.headers["sec-fetch-site"] !== "same-origin"
    )) {
      sendJson(res, 403, { error: { code: "ORIGIN_DENIED", message: "Use walking routes from this app's approved website." } });
      return;
    }
    if (publicMode && !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
      sendJson(res, 415, { error: { code: "CONTENT_TYPE", message: "Use application/json." } });
      return;
    }
    const parsed = FetchWalkingRoutesBody.safeParse(req.body);
    if (!parsed.success) {
      sendJson(res, 400, { error: { code: "INVALID_INPUT", message: "Provide a valid origin and destination." } });
      return;
    }
    if (publicMode && !isPublicCampusTrip(parsed.data)) {
      sendJson(res, 400, { error: { code: "SERVICE_AREA", message: "Choose two different, validated coordinates in the UIUC walking area. Public routing does not accept free-text addresses." } });
      return;
    }
    if (publicMode && !allowPeer(req.socket.remoteAddress ?? "unknown-peer")) {
      res.setHeader("Retry-After", "60");
      sendJson(res, 429, { error: { code: "RATE_LIMIT", message: "Too many requests from this network. Wait a minute and try manually; demo routes remain available." } });
      return;
    }
    if (publicMode && !allowClient(req, res)) {
      res.setHeader("Retry-After", "60");
      sendJson(res, 429, { error: { code: "CLIENT_RATE_LIMIT", message: "This browser's routing limit is reached. Wait a minute; no automatic retry." } });
      return;
    }
    if (publicMode) publicRequests.add(req); // Mark only after the full public policy passes.
    await adapter(req, res);
  });
  return router;
}
export default createCampusRouteHandler();
