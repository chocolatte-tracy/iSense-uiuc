import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { nextReportBucket, validateReportTime, type ReportsStore } from "./community-reports";
import { createCommunityReportsRouter } from "../routes/community-reports";

test("report observation time preserves valid instants and rejects stale/future data", () => {
  const now = Date.now();
  assert.doesNotThrow(() => validateReportTime(new Date(now), now));
  assert.doesNotThrow(() => validateReportTime(new Date(now - 6 * 86400000).toISOString(), now));
  for (const time of ["invalid", new Date(now + 301000).toISOString(), new Date(now - 8 * 86400000).toISOString()])
    assert.throws(() => validateReportTime(time, now), /last 7 days/);
});
test("report bucket state survives reloading; windows, hourly and global daily limits cannot be bypassed", () => {
  const now = 1780000000000;
  let state = { start: 0, requests: 0 };
  for (let i = 0; i < 3; i++) state = nextReportBucket(state.start, state.requests, now, 60000, 3);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.throws(() => nextReportBucket(reloaded.start, reloaded.requests, now, 60000, 3), /Too many/);
  assert.equal(nextReportBucket(state.start, state.requests, now + 60000, 60000, 3).requests, 1);
  for (const [window, limit] of [[3600000, 20], [86400000, 500]]) {
    const start = Math.floor(now / window) * window;
    assert.throws(() => nextReportBucket(start, limit, now, window, limit));
  }
});
test("anonymous reports use shared storage, strict geographic/value validation and separate security", async () => {
  const rows: Awaited<ReturnType<ReportsStore["list"]>> = [];
  let saves = 0, peerKey = "";
  const store: ReportsStore = {
    list: async () => rows,
    create: async (input, key) => {
      saves++; peerKey = key;
      const report = { ...input, id: `test-${saves}`, createdAt: new Date(), verified: false as const };
      rows.push(report); return report;
    },
  };
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => { (_req as any).log = { warn() {} }; next(); });
  app.use("/api", createCommunityReportsRouter({ store, origins: ["https://campus.invalid"], secret: "offline-only-test-secret-with-enough-length" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const endpoint = `http://127.0.0.1:${port}/api/community-reports`;
  const headers = { "Content-Type": "application/json", Origin: "https://campus.invalid", "Sec-Fetch-Site": "same-origin" };
  const input = { locationName: "Main Quad", latitude: 40.1075, longitude: -88.2272,
    noise: "quiet", crowds: "low", observedAt: new Date().toISOString() };
  const post = (body: unknown, extra = {}) => fetch(endpoint, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  try {
    const created = await post(input);
    assert.equal(created.status, 201);
    assert.equal((await created.json() as { verified: boolean }).verified, false);
    assert.equal(saves, 1);
    assert.match(peerKey, /^[a-f0-9]{64}$/);
    const list = await (await fetch(endpoint)).json() as { storage: string; reports: { observedAt: string }[] };
    assert.equal(list.storage, "shared"); assert.equal(list.reports.length, 1);
    assert.equal(list.reports[0].observedAt, input.observedAt);
    for (const body of [
      { ...input, noise: "invented" }, { ...input, crowds: "unknown" },
      { ...input, latitude: 45 }, { ...input, longitude: 0 }, { ...input, latitude: "40.1075" },
      { ...input, locationName: "" }, { ...input, verified: true }, { ...input, quota: 9999 },
      { ...input, observedAt: Date.now() }, { ...input, observedAt: new Date(Date.now() + 600000).toISOString() },
    ]) assert.equal((await post(body)).status, 400);
    assert.equal((await post(input, { Origin: "https://attacker.invalid" })).status, 403);
    assert.equal(saves, 1, "rejected input does not create observations");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("report storage failure is explicit, never silent local success", async () => {
  const store: ReportsStore = { list: async () => { throw new Error("offline"); }, create: async () => { throw new Error("offline"); } };
  const app = express();
  app.use((_req, _res, next) => { (_req as any).log = { warn() {} }; next(); });
  app.use(createCommunityReportsRouter({ store }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/community-reports`);
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "REPORT_STORAGE_UNAVAILABLE");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
