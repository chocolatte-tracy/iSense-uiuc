import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import type { CommunityReport, CommunityReportInput } from "@workspace/api-zod";

export class ReportError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function validateReportTime(observedAt: string | Date, now = Date.now()) {
  const time = observedAt instanceof Date ? observedAt.getTime() : Date.parse(observedAt);
  if (!Number.isFinite(time) || time < now - 7 * 86400000 || time > now + 300000)
    throw new ReportError("OBSERVATION_TIME", "Choose a time within the last 7 days, no more than 5 minutes ahead.");
}
export function nextReportBucket(start: number, requests: number, now: number, window: number, limit: number) {
  const current = Math.floor(now / window) * window;
  const count = start === current ? requests : 0;
  if (count >= limit) throw new ReportError("REPORT_RATE_LIMIT", "Too many reports from this network. Try later.", 429);
  return { start: current, requests: count + 1 };
}
export type ReportsStore = {
  list(): Promise<CommunityReport[]>;
  create(input: CommunityReportInput, peerKey: string): Promise<CommunityReport>;
};
function toReport(row: Record<string, unknown>): CommunityReport {
  return {
    id: String(row.id), locationName: String(row.location_name),
    latitude: Number(row.latitude), longitude: Number(row.longitude),
    noise: row.noise as CommunityReport["noise"], crowds: row.crowds as CommunityReport["crowds"],
    observedAt: new Date(row.observed_at as string),
    createdAt: new Date(row.created_at as string), verified: false,
  };
}
export function createReportsStore(): ReportsStore {
  return {
    async list() {
      const result = await pool.query("SELECT * FROM community_reports ORDER BY observed_at DESC, id DESC LIMIT 100");
      return result.rows.map(toReport);
    },
    async create(input, peerKey) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const clock = await client.query("SELECT (extract(epoch from clock_timestamp()) * 1000)::bigint AS now_ms");
        const now = Number(clock.rows[0].now_ms);
        validateReportTime(input.observedAt, now);
        // Stable lock ordering; limits and insert commit atomically across replicas/restarts.
        const policies = [
          { id: "global-day", window: 86400000, limit: 500 },
          { id: `hour:${peerKey}`, window: 3600000, limit: 20 },
          { id: `minute:${peerKey}`, window: 60000, limit: 3 },
        ];
        for (const policy of policies) {
          await client.query("INSERT INTO community_report_limits (id,window_start,requests) VALUES ($1,0,0) ON CONFLICT DO NOTHING", [policy.id]);
          const result = await client.query("SELECT window_start,requests FROM community_report_limits WHERE id=$1 FOR UPDATE", [policy.id]);
          const bucket = nextReportBucket(Number(result.rows[0].window_start), result.rows[0].requests, now, policy.window, policy.limit);
          await client.query("UPDATE community_report_limits SET window_start=$2,requests=$3 WHERE id=$1", [policy.id, bucket.start, bucket.requests]);
        }
        const result = await client.query(`INSERT INTO community_reports
          (id,location_name,latitude,longitude,noise,crowds,observed_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [randomUUID(), input.locationName.trim(), input.latitude, input.longitude, input.noise, input.crowds, input.observedAt]);
        await client.query("DELETE FROM community_report_limits WHERE window_start < $1", [now - 7 * 86400000]);
        await client.query("COMMIT");
        return toReport(result.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    },
  };
}
