import assert from "node:assert/strict";
import { test } from "node:test";
import { getPublicMapsConfig, routesEnabled, publicRoutingEnabled } from "./google-routes.mjs";

test("map-only approval does not enable routes or expose a server key", () => {
  // Isolated test process, synthetic values, no network.
  process.env.VITE_GOOGLE_MAPS_API_KEY = "synthetic-browser-test";
  process.env.GOOGLE_ROUTES_API_KEY = "synthetic-server-test";
  process.env.ROUTING_TEAM_ACCESS_TOKEN = "synthetic-private-team-code-32-characters";
  process.env.GOOGLE_MAPS_API_ENABLED = "false";
  process.env.GOOGLE_PLACES_API_ENABLED = "false";
  process.env.GOOGLE_ROUTES_API_ENABLED = "false";
  process.env.GOOGLE_ROUTES_PUBLIC_ENABLED = "false";
  assert.equal(getPublicMapsConfig().browserApiKey, undefined);
  process.env.GOOGLE_MAPS_API_ENABLED = "true";
  const config = getPublicMapsConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.routesEnabled, false);
  assert.equal(config.browserApiKey, "synthetic-browser-test");
  assert.ok(!JSON.stringify(config).includes("synthetic-server-test"));
  assert.ok(!JSON.stringify(config).includes("synthetic-private-team-code"));
  assert.equal(routesEnabled(), false);
});

test("public routing needs separate opt-in and a valid owner cost reserve, not just a key", () => {
  process.env.SESSION_SECRET = "synthetic-session-secret-at-least-32-characters";
  process.env.GOOGLE_ROUTES_API_KEY = "synthetic-server-test";
  process.env.GOOGLE_ROUTES_API_ENABLED = "true";
  process.env.GOOGLE_ROUTES_PUBLIC_ENABLED = "false";
  process.env.ROUTING_REQUEST_RESERVE_CENTS = "5";
  assert.equal(getPublicMapsConfig().publicRoutesEnabled, false);
  process.env.GOOGLE_ROUTES_PUBLIC_ENABLED = "true";
  assert.equal(publicRoutingEnabled(), true);
  process.env.ROUTING_REQUEST_RESERVE_CENTS = "0";
  assert.equal(getPublicMapsConfig().publicRoutesEnabled, false);
  process.env.ROUTING_REQUEST_RESERVE_CENTS = "5";
  assert.equal(getPublicMapsConfig().publicRoutesEnabled, true);
  process.env.GOOGLE_ROUTES_API_ENABLED = "false";
  assert.equal(getPublicMapsConfig().publicRoutesEnabled, false);
});

test("budget diagnostics identify each invalid field without changing default policy", () => {
  const names = ["ROUTING_MAX_PER_MINUTE", "ROUTING_MAX_PER_DAY", "ROUTING_MAX_TOTAL",
    "ROUTING_MAX_CONCURRENT", "ROUTING_BUDGET_CENTS", "ROUTING_REQUEST_RESERVE_CENTS"];
  const before = names.map(name => [name, process.env[name]]);
  try {
    for (const name of names) delete process.env[name];
    let config = getPublicMapsConfig();
    assert.equal(config.budgetConfigured, false);
    assert.deepEqual(config.budgetConfigurationIssues, [
      "ROUTING_REQUEST_RESERVE_CENTS must be an explicitly configured positive integer.",
    ]);
    process.env.ROUTING_REQUEST_RESERVE_CENTS = "7"; // Synthetic fixture, not a Google price.
    assert.equal(getPublicMapsConfig().budgetConfigured, true);
    for (const name of names) {
      const original = process.env[name];
      process.env[name] = "0";
      config = getPublicMapsConfig();
      assert.equal(config.budgetConfigured, false);
      assert.deepEqual(config.budgetConfigurationIssues, [
        `${name} must be an explicitly configured positive integer.`,
      ]);
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Places requires its exact independent flag and a browser key", () => {
  process.env.VITE_GOOGLE_MAPS_API_KEY = "synthetic-browser-test";
  delete process.env.GOOGLE_MAPS_BROWSER_API_KEY;
  process.env.GOOGLE_MAPS_API_ENABLED = "false";
  for (const value of ["", "false", "TRUE", "1", " true ", undefined]) {
    if (value === undefined) delete process.env.GOOGLE_PLACES_API_ENABLED;
    else process.env.GOOGLE_PLACES_API_ENABLED = value;
    assert.equal(getPublicMapsConfig().placesEnabled, false);
    assert.equal(getPublicMapsConfig().placesStatus, "PLACES_DISABLED");
  }
  process.env.GOOGLE_PLACES_API_ENABLED = "true";
  assert.equal(getPublicMapsConfig().placesEnabled, true);
  assert.equal(getPublicMapsConfig().enabled, false); // Independent of map display.
  delete process.env.VITE_GOOGLE_MAPS_API_KEY;
  assert.equal(getPublicMapsConfig().placesEnabled, false);
  assert.equal(getPublicMapsConfig().placesStatus, "BROWSER_KEY_MISSING");
});
