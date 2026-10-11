import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import type { RoutingBudget } from "@workspace/db";
import { RoutingError } from "@workspace/campus-routing/routing";
import { logger } from "./logger";

export type BudgetLimits = {
  perMinute: number; perDay: number; total: number; concurrent: number;
  budgetCents: number; requestReserveCents: number;
};
export interface DurableBudget { reserve(): Promise<() => Promise<void>> }

function positiveInteger(value: string | undefined, fallback?: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number! <= 0) {
    throw new RoutingError("BUDGET_NOT_CONFIGURED", "The owner must configure valid routing limits and a conservative per-request cost reserve. Demo routes remain available.", 503);
  }
  return number!;
}
export function configuredBudgetLimits(): BudgetLimits {
  return {
    perMinute: positiveInteger(process.env.ROUTING_MAX_PER_MINUTE, 3),
    perDay: positiveInteger(process.env.ROUTING_MAX_PER_DAY, 10),
    total: positiveInteger(process.env.ROUTING_MAX_TOTAL, 20),
    concurrent: positiveInteger(process.env.ROUTING_MAX_CONCURRENT, 1),
    budgetCents: positiveInteger(process.env.ROUTING_BUDGET_CENTS, 100),
    requestReserveCents: positiveInteger(process.env.ROUTING_REQUEST_RESERVE_CENTS),
  };
}

export function reserveLedger(row: RoutingBudget, limits: BudgetLimits, now: number, leaseId: string): RoutingBudget {
  const minuteStart = Math.floor(now / 60000) * 60000;
  const dayStart = Math.floor(now / 86400000) * 86400000;
  const leases = Object.fromEntries(Object.entries(row.leases).filter(([, expiry]) => expiry > now));
  const minuteRequests = row.minuteStart === minuteStart ? row.minuteRequests : 0;
  const dayRequests = row.dayStart === dayStart ? row.dayRequests : 0;
  if (row.totalRequests >= limits.total || row.reservedCents + limits.requestReserveCents > limits.budgetCents) {
    throw new RoutingError("SPENDING_LIMIT", "The shared routing spending/request limit has been reached. It does not reset on restart. Contact the owner; demo routes remain available.", 429);
  }
  if (dayRequests >= limits.perDay) {
    throw new RoutingError("DAILY_LIMIT", `The shared daily routing limit is reached. Resets at ${new Date(dayStart + 86400000).toISOString()} (UTC). Demo routes remain available.`, 429);
  }
  if (minuteRequests >= limits.perMinute) {
    throw new RoutingError("RATE_LIMIT", `The shared minute routing limit is reached. Try manually after ${new Date(minuteStart + 60000).toISOString()}.`, 429);
  }
  if (Object.keys(leases).length >= limits.concurrent) {
    throw new RoutingError("ROUTING_BUSY", "Another team request is in progress. Wait up to 60 seconds, then try manually. Demo routes remain available.", 429);
  }
  return { ...row, minuteStart, dayStart, minuteRequests: minuteRequests + 1,
    dayRequests: dayRequests + 1, totalRequests: row.totalRequests + 1,
    reservedCents: row.reservedCents + limits.requestReserveCents,
    leases: { ...leases, [leaseId]: now + 60000 } };
}

// Atomic row lock serializes reservations across processes; no in-memory fallback.
// Leases outlive the hard 12s upstream timeout; crashed workers never refund cost.
export function createPostgresBudget(id = "google-walking-routes", limits = configuredBudgetLimits): DurableBudget {
  return {
    async reserve() {
      const policy = limits();
      const leaseId = randomUUID();
      const client = await pool.connect().catch(() => {
        throw new RoutingError("BUDGET_UNAVAILABLE", "Persistent routing limits are unavailable. Live requests are blocked; demo routes remain available.", 503);
      });
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO routing_budget (id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
        const result = await client.query("SELECT *, (extract(epoch from clock_timestamp()) * 1000)::bigint AS now_ms FROM routing_budget WHERE id = $1 FOR UPDATE", [id]);
        const raw = result.rows[0];
        const next = reserveLedger({
          id, totalRequests: raw.total_requests, reservedCents: Number(raw.reserved_cents),
          minuteStart: Number(raw.minute_start), minuteRequests: raw.minute_requests,
          dayStart: Number(raw.day_start), dayRequests: raw.day_requests, leases: raw.leases,
        }, policy, Number(raw.now_ms), leaseId);
        await client.query(`UPDATE routing_budget SET total_requests=$2, reserved_cents=$3,
          minute_start=$4, minute_requests=$5, day_start=$6, day_requests=$7, leases=$8 WHERE id=$1`,
        [id, next.totalRequests, next.reservedCents, next.minuteStart, next.minuteRequests, next.dayStart, next.dayRequests, JSON.stringify(next.leases)]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        if (error instanceof RoutingError) throw error;
        logger.warn("Persistent routing reservation failed; live routing blocked");
        throw new RoutingError("BUDGET_UNAVAILABLE", "Persistent routing limits are unavailable. Live requests are blocked; demo routes remain available.", 503);
      } finally { client.release(); }
      return async () => {
        // Release concurrency only, never refund a potentially billable attempt.
        await pool.query("UPDATE routing_budget SET leases = leases - $2::text WHERE id=$1", [id, leaseId]).catch(() => {
          logger.warn("Routing lease release failed; lease will expire without refunding the cost reserve");
        });
      };
    },
  };
}
