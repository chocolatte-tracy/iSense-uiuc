import { createHmac } from "node:crypto";
import { Router } from "express";
import { CreateCommunityReportBody } from "@workspace/api-zod";
import { allowedPreviewOrigins } from "./walking-routes";
import { createPublicPeerLimiter } from "../lib/public-routing";
import { createReportsStore, ReportError, validateReportTime, type ReportsStore } from "../lib/community-reports";

export function createCommunityReportsRouter(options: { store?: ReportsStore; origins?: string[]; secret?: string } = {}) {
  const router = Router();
  const store = options.store ?? createReportsStore();
  const origins = options.origins ?? allowedPreviewOrigins();
  const secret = options.secret ?? process.env.SESSION_SECRET ?? "";
  const allowPeer = createPublicPeerLimiter(Date.now, 30);
  router.get("/community-reports", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json({ storage: "shared", reports: await store.list() }); }
    catch { req.log.warn("Community reports storage unavailable"); res.status(503).json({ error: { code: "REPORT_STORAGE_UNAVAILABLE", message: "Shared reports are unavailable. Try again later; nothing was saved locally." } }); }
  });
  router.post("/community-reports", async (req, res) => {
    const fail = (status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
    if (!origins.includes(req.headers.origin ?? "") || req.headers["sec-fetch-site"] !== "same-origin")
      return void fail(403, "ORIGIN_DENIED", "Submit reports from iSense.");
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? ""))
      return void fail(415, "CONTENT_TYPE", "Use a JSON report.");
    const parsed = CreateCommunityReportBody.strict().safeParse(req.body);
    if (!parsed.success || !parsed.data.locationName.trim() || typeof req.body.observedAt !== "string")
      return void fail(400, "INVALID_REPORT", "Choose valid campus coordinates, noise, crowd level and observation time.");
    try { validateReportTime(parsed.data.observedAt); }
    catch { return void fail(400, "OBSERVATION_TIME", "Choose a time within the last 7 days, no more than 5 minutes ahead."); }
    if (secret.length < 32) return void fail(503, "REPORTS_NOT_CONFIGURED", "Shared report submission is not configured.");
    const peer = req.socket.remoteAddress ?? "unknown";
    if (!allowPeer(peer)) { res.setHeader("Retry-After", "60"); return void fail(429, "REPORT_RATE_LIMIT", "Too many submissions. Try later."); }
    // Do not trust caller-supplied X-Forwarded-For or store raw network addresses.
    const peerKey = createHmac("sha256", secret).update(`reports:${peer}`).digest("hex");
    try {
      const report = await store.create(parsed.data, peerKey);
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json(report);
    } catch (error) {
      if (error instanceof ReportError) {
        if (error.status === 429) res.setHeader("Retry-After", "60");
        return void fail(error.status, error.code, error.message);
      }
      req.log.warn("Community report could not be saved");
      fail(503, "REPORT_STORAGE_UNAVAILABLE", "Shared storage is unavailable. Your report was not saved; try manually later.");
    }
  });
  return router;
}
export default createCommunityReportsRouter();
