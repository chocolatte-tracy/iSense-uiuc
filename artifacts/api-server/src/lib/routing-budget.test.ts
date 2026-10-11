import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, type RoutingBudget } from "@workspace/db";
import { authorizeTeamRouting } from "./team-routing-access";
import { createPostgresBudget, configuredBudgetLimits, reserveLedger, type BudgetLimits } from "./routing-budget";
import type { RouteRequest } from "@workspace/campus-routing/proxy";

const limits: BudgetLimits = { perMinute: 3, perDay: 10, total: 20, concurrent: 1, budgetCents: 100, requestReserveCents: 10 };
const initial: RoutingBudget = { id: "fixture", totalRequests: 0, reservedCents: 0, minuteStart: 0, minuteRequests: 0, dayStart: 0, dayRequests: 0, leases: {} };
const fails = (code: string) => (error: unknown) => error instanceof Error && "code" in error && error.code === code;

test("team access is fail-closed and separate from any Google key", () => {
  const req = (authorization?: string) => ({ headers: { authorization } }) as RouteRequest;
  assert.equal(authorizeTeamRouting(req("Bearer short"), "short"), false);
  const token = "synthetic-secret-at-least-32-characters";
  assert.equal(authorizeTeamRouting(req(`Bearer ${token}`), token), true);
  assert.equal(authorizeTeamRouting(req(`Basic ${token}`), token), false);
  assert.equal(authorizeTeamRouting(req(), token), false);
  assert.equal(authorizeTeamRouting(req("Bearer other-token"), token), false);
});

test("limits require an explicit valid cost reserve and reject invalid configuration", () => {
  const previous = process.env.ROUTING_REQUEST_RESERVE_CENTS;
  try {
    for (const value of [undefined, "", "0", "-1", "NaN", "1.5", "Infinity"]) {
      if (value === undefined) delete process.env.ROUTING_REQUEST_RESERVE_CENTS;
      else process.env.ROUTING_REQUEST_RESERVE_CENTS = value;
      assert.throws(configuredBudgetLimits, fails("BUDGET_NOT_CONFIGURED"));
    }
  } finally {
    if (previous === undefined) delete process.env.ROUTING_REQUEST_RESERVE_CENTS;
    else process.env.ROUTING_REQUEST_RESERVE_CENTS = previous;
  }
});

test("all budget settings share positive-safe-integer parsing and documented defaults", () => {
  const settings = {
    ROUTING_MAX_PER_MINUTE: "3", ROUTING_MAX_PER_DAY: "10",
    ROUTING_MAX_TOTAL: "20", ROUTING_MAX_CONCURRENT: "1",
    ROUTING_BUDGET_CENTS: "100", ROUTING_REQUEST_RESERVE_CENTS: "10",
  };
  const names = Object.keys(settings);
  const before = names.map(name => [name, process.env[name]] as const);
  try {
    for (const name of names) delete process.env[name];
    process.env.ROUTING_REQUEST_RESERVE_CENTS = "10"; // Synthetic, not a Google price.
    assert.deepEqual(configuredBudgetLimits(), limits);
    Object.assign(process.env, settings);
    for (const name of names) {
      for (const value of ["", " ", "0", "-1", "0.5", "1 cents", "true", "NaN", "Infinity", "9007199254740992"]) {
        process.env[name] = value;
        assert.throws(configuredBudgetLimits, fails("BUDGET_NOT_CONFIGURED"), `${name}: invalid numeric format`);
      }
      process.env[name] = settings[name as keyof typeof settings];
    }
    // Retain existing Number(value) parsing; recommend plain decimal digits in setup.
    for (const [value, expected] of [["10", 10], [" 10 ", 10], ["10.0", 10], ["1e2", 100], ["0x10", 16]] as const) {
      process.env.ROUTING_REQUEST_RESERVE_CENTS = value;
      assert.equal(configuredBudgetLimits().requestReserveCents, expected);
    }
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("minute/day windows reset but spending and lifetime limits never reset", () => {
  const now = 86400000 + 60000;
  const row = reserveLedger(initial, limits, now, "first");
  assert.equal(row.reservedCents, 10);
  assert.throws(() => reserveLedger(row, limits, now, "second"), fails("ROUTING_BUSY"));
  assert.equal(reserveLedger(row, limits, now + 60001, "second").totalRequests, 2);
  assert.throws(() => reserveLedger({ ...row, leases: {}, minuteRequests: 3 }, limits, now, "x"), fails("RATE_LIMIT"));
  assert.throws(() => reserveLedger({ ...row, leases: {}, dayRequests: 10 }, limits, now, "x"), fails("DAILY_LIMIT"));
  assert.equal(reserveLedger({ ...row, dayRequests: 10 }, limits, now + 86400000, "x").dayRequests, 1);
  assert.throws(() => reserveLedger({ ...initial, reservedCents: 100 }, limits, now + 86400000, "x"), fails("SPENDING_LIMIT"));
  assert.throws(() => reserveLedger({ ...initial, totalRequests: 20 }, limits, now + 86400000, "x"), fails("SPENDING_LIMIT"));
});

test("Postgres reservations survive fresh handler instances and serialize concurrent attempts", async t => {
  const id = `offline-test-${randomUUID()}`;
  t.after(async () => { await pool.query("DELETE FROM routing_budget WHERE id=$1", [id]); });
  const first = createPostgresBudget(id, () => ({ ...limits, total: 2 }));
  const outcomes = await Promise.allSettled([first.reserve(), createPostgresBudget(id, () => limits).reserve()]);
  const granted = outcomes.filter(result => result.status === "fulfilled");
  assert.equal(granted.length, 1);
  const denied = outcomes.find(result => result.status === "rejected");
  assert.ok(denied?.status === "rejected" && fails("ROUTING_BUSY")(denied.reason));
  for (const result of granted) if (result.status === "fulfilled") await result.value();
  // Recreating the service (as after restart) must not reset counters.
  const restarted = createPostgresBudget(id, () => ({ ...limits, total: 2 }));
  const release = await restarted.reserve();
  await release();
  await assert.rejects(createPostgresBudget(id, () => ({ ...limits, total: 2 })).reserve(), fails("SPENDING_LIMIT"));
  const ledger = (await pool.query("SELECT total_requests, reserved_cents FROM routing_budget WHERE id=$1", [id])).rows[0];
  assert.equal(ledger.total_requests, 2);
  assert.equal(Number(ledger.reserved_cents), 20);
});

test.after(async () => { await pool.end(); });
