import { createHash, timingSafeEqual } from "node:crypto";
import type { RouteRequest } from "@workspace/campus-routing/proxy";

// Separate from Google credentials. Never returned in config or saved by the UI.
export function authorizeTeamRouting(req: RouteRequest, token = process.env.ROUTING_TEAM_ACCESS_TOKEN): boolean {
  const header = req.headers.authorization;
  if (!token || token.length < 32 || typeof header !== "string" || header.length > 1024) return false;
  if (!header.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(token));
}
