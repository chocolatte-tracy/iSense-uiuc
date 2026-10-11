# iSense — Project README for Review

For the mobile search/layout revision and crowd-ranking audit, including
synthetic test results, uncertainty rules and the future Reports data plan,
see [mobile and ranking review](docs/isense-mobile-ranking-review.md).

**Status:** Existing iSense React/Vite/PWA with the team's routing module, honest demo sensory data, and shared anonymous Community Reports. Live routing is available only when its production feature flags, keys, persistent quota and budget configuration all pass; code changes do not automatically update the published app.

## Mobile screens and Community Reports

- Four independent screens: Map, Preferences, Routes and Reports. Safe-area padding has one owner; enlarged text and keyboards use contained scrolling.
- Reports use the existing managed PostgreSQL database through `GET /api/community-reports` and `POST /api/community-reports`. Development schema: `pnpm --filter @workspace/db run push`. Publish applies the additive production schema; do not run production DDL or overwrite production data.
- A report contains a chosen campus location/point, coordinates, subjective noise (`quiet/moderate/loud`), crowds (`low/moderate/high`), observation time and server creation time. Observation time must be within seven days, at most five minutes in the future. No account, raw network address, automatic GPS history or personal-message field is collected.
- These public observations are unverified, not dB(A) measurements, not full-route coverage and **never inputs to sensory route ranking**.
- Submission limits are separate from Google's routing ledger: persistent network buckets of 3/minute and 20/hour plus a global 500/day, committed atomically with each observation. Unknown proxy topology conservatively groups network peers; spoofed forwarding headers are ignored. Storage failure is explicit, not a local-only success.
- Google Places (New) also needs `GOOGLE_PLACES_API_ENABLED=true` in the application's production configuration. Cloud service enablement alone is insufficient.
- Routing validates six positive-integer limits: `ROUTING_MAX_PER_MINUTE`, `ROUTING_MAX_PER_DAY`, `ROUTING_MAX_TOTAL`, `ROUTING_MAX_CONCURRENT`, `ROUTING_BUDGET_CENTS`, and **`ROUTING_REQUEST_RESERVE_CENTS`**. The first five have conservative defaults; the reserve must be explicitly set from an owner-confirmed cost assumption. Blank overrides are invalid. This app does not invent Google prices or reset/refund reservations. Public configuration reports invalid field names without exposing server secrets.
- Exact formats, units, restart behavior, and step-by-step production configuration: [`artifacts/quiet-campus/PRODUCTION_SETUP.md`](artifacts/quiet-campus/PRODUCTION_SETUP.md).
- Checks: `pnpm run typecheck`; `scripts/node_modules/.bin/tsx --test artifacts/api-server/src/lib/*.test.ts artifacts/api-server/src/lib/*.test.mjs artifacts/quiet-campus/src/lib/*.test.ts`; web build with its service environment, e.g. `PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build`.

This document is intended to be uploaded to ChatGPT for project advice. It describes the current implementation, not a promise of production readiness. It contains no API key values or personal information.

## 1. What we are building

iSense is a mobile-first web application that helps people compare campus walking routes based on sensory preferences.

- **Campus:** University of Illinois Urbana-Champaign (UIUC).
- **Initial journey:** Main Quad → Grainger Engineering Library.
- **Visual identity:** Light orange and light blue.
- **Team context:** Four beginner hackathon participants, with approximately six hours of total development time.
- **Implementation approach:** Continue the existing application and preserve its routing, scoring and data pipeline. The authorized mobile UI update uses progressive disclosure rather than replacing the product.

The app distinguishes a user's **importance weights** from their **exposure acceptance levels**.

It does not currently measure campus noise, crowd density, or sunlight. It is not an accessibility-verified navigation service.

## 2. Current functionality

### Trip selection

The app includes researched route candidates for Main Quad → Grainger Engineering Library.

Destination and start now use searchable campus suggestions, with optional browser geolocation and swap. Main Quad and Grainger have supplied coordinates; Main Library remains disabled pending coordinates. Free text is never treated as a confirmed location.

Other selected pairs show an explicit no-route-data state while live routing is disabled. **Google Places remains off**: arbitrary addresses cannot yet be resolved. Existing live routing, once separately approved, receives selected coordinate objects through the same backend.

The app now opens Map and uses three independent Map / Preferences / Routes screens. Find routes opens Routes only when candidates are obtained; preferences and evidence retain state across tabs. Balanced / Quieter / Less Crowded / Fastest presets preserve locks and acceptance settings. Installation guidance is contextual, not a fourth navigation tab.

Chinese usage, privacy, service-area limits and validation notes: [`LOCATION-SEARCH.md`](artifacts/quiet-campus/LOCATION-SEARCH.md).

### Importance: four shares total 100%

| Indicator | Default importance |
| --- | ---: |
| Noise | 40% |
| Crowds | 30% |
| Sun exposure | 20% |
| Short walking time | 10% |
| **Total** | **100%** |

Each importance slider has a Lock/Unlock button. Locked shares retain their exact percentages. Moving an unlocked slider proportionally redistributes the available percentage among the other unlocked shares, after accounting for locked shares. Integer rounding uses deterministic largest-remainder allocation so the total stays exactly 100%. If the other unlocked shares are all zero, the available remainder is divided evenly.

Requests cannot exceed the available percentage. With only one unlocked share, its value is determined by the locked shares and dragging is disabled. All four shares may be locked, but at least two must be unlocked to adjust the balance. Reset restores 40/30/20/10 and clears all locks. Acceptance controls and the extra-walking constraint remain independent.

### Acceptance: separate from importance

Noise, crowds, and sunlight each have independent Low / Medium / High acceptance controls:

| Acceptance | Current simulated exposure limit |
| --- | ---: |
| Low | ≤33 out of 100 |
| Medium | ≤66 out of 100 |
| High | ≤100 out of 100 |

These thresholds are prototype assumptions, not scientifically validated limits.

For example, **Noise importance 40% + acceptance Low** means noise strongly affects the recommendation and only low noise feels manageable. It does not mean noise has low importance.

### Walking-time constraint

- Maximum extra walking time is a separate 0–10 minute limit.
- Default: 5 extra minutes.
- It is measured relative to the fastest available route.
- It is not included in the 100% importance total.
- Routes exceeding the limit are excluded, even when no route meets the sensory acceptance levels.

### Recommendation and selection

Preference changes recalculate route ranking locally without another Google API request.

The app highlights a recommendation, updates its explanation, and retains selectable route cards with their own navigation links. Manual route selection stays active while that route remains eligible; otherwise the detail view falls back to the current recommendation.

Reset restores the default importance shares, Medium acceptance levels, and 5-minute extra-walking limit. Preferences and locks are saved only in localStorage and restored on refresh/reopen; trip coordinates, imported observations and route responses are not persisted.

## 3. Current recommendation algorithm

For the currently available routes:

1. Determine the fastest and slowest walking times.
2. Exclude routes outside the maximum-extra-minutes limit.
3. Identify routes satisfying all three sensory acceptance limits.
4. If any full sensory matches exist, rank only those matches.
5. Otherwise, rank all time-eligible routes and explicitly disclose that no full sensory match exists.

For a sensory exposure value `c` and acceptance threshold `t`:

```text
excess = 0                                      if t = 100
excess = max(0, c - t) / (100 - t) × 100        otherwise

sensoryCost = 0.25 × c + 0.75 × excess
```

This retains a preference for lower exposure within an acceptable range, while adding a stronger penalty above the acceptance threshold.

Walking time is normalized using the fastest and slowest times among all available routes:

```text
timeCost = 0                                         if all times are equal
timeCost = (routeTime - fastest) / (slowest - fastest) × 100 otherwise
```

Final score is the weighted mean of the three sensory costs and normalized walking-time cost. Lower is better.

Equal scores favor the shorter walk, then a deterministic route-ID order. Routes A and B both take 9 minutes; neither is treated as uniquely fastest.

**Important review question:** The thresholds and 25%/75% cost blend are implementation choices for a demo. They require user research and sensitivity testing.

## 4. Research fallback routes

The walking times and distances below were supplied by the team from route research. They are not freshly retrieved live Google results.

| Route | Name | Walking time | Distance |
| --- | --- | ---: | ---: |
| A | via unnamed roads | 9 minutes | 0.4 miles |
| B | via W Green St | 9 minutes | 0.4 miles |
| C | via S Wright St | 10 minutes | 0.5 miles |

### Environmental values — DEMO DATA ONLY

Higher values represent higher modeled exposure.

| Route | Noise /100 | Crowds /100 | Sun exposure /100 |
| --- | ---: | ---: | ---: |
| A | 24 | 31 | 28 |
| B | 58 | 63 | 52 |
| C | 18 | 22 | 68 |

These values are simulated, not campus observations.

With the default Medium acceptance levels, A and B are eligible sensory matches; C is excluded because its simulated sunlight value is 68, above the Medium limit of 66. Raising sunlight acceptance to High allows C to participate when the time limit permits it.

### Candidate research waypoints, in order

- **A:** `(40.109418, -88.227915)` → `(40.111100, -88.227743)`
- **B:** `(40.108808, -88.226757)` → `(40.110380, -88.226476)`
- **C:** `(40.108544, -88.228802)` → `(40.109699, -88.228124)` → `(40.110516, -88.227728)`

Original team-provided Google Maps links:

- A: https://maps.app.goo.gl/G8fQKGbxmU5nktRr6
- B: https://maps.app.goo.gl/GWZgo8hSFYyLN3q89
- C: https://maps.app.goo.gl/4zw9sjThFmVHrguSA

The waypoints are candidate samples, not every turn. Their locations and navigation behavior still need field validation. The app does not draw invented route geometry from these points.

## 5. Google Maps integration

### Maps JavaScript API — working in development

The official Google Maps JavaScript API displays the UIUC campus map.

- Main Quad marker: `40.1075212, -88.227231`.
- Grainger marker: `40.1124997, -88.2269172`.
- Endpoint coordinates were resolved from the team's original Maps link; they are not verified accessible entrances.
- Map configuration permits pan and zoom.
- Loading failures produce a visible message while route cards remain available.
- Initial map bounds are fitted to the two endpoints.

The team reports enabling **Maps JavaScript API** and **Routes API** in its Google Cloud project and adding separate browser and server keys through Replit Secrets.

### Routes API — prepared, NOT enabled

The existing Express backend mounts the team's `createRouteHandler` at
`POST /api/walking-routes`. The reusable JavaScript routing module lives
in `lib/campus-routing`; no standalone server or second Routes implementation
was added. The previous provider was removed, and the old GET endpoint returns 410.

Input: `{ origin, destination }`, with address strings or `{lat, lng}` points.
Output: decoded paths, encoded polylines, exact seconds/meters, labels, route count,
and the upstream result. The server key never goes to the browser.

The endpoint retains sanitized errors, a 12-second timeout, input validation,
and exact origin checks. Default private mode still requires separate team authorization,
but the public UI has no code entry. A separately opted-in public mode accepts only
distinct UIUC coordinate endpoints and same-origin browser requests, with a bounded
transport-peer rate limiter. PostgreSQL-backed atomic reservations enforce shared minute, daily,
lifetime, concurrency, and estimated spending limits across restarts and server
instances. Missing configuration or unavailable budget storage blocks live
requests. There is no automatic retry or duplicate cache/provider.

See `artifacts/api-server/ROUTING_SAFETY.md` for setup, defaults, and limits of
estimated cost accounting. Maps and Routes approval remain separate and unchanged.
See `artifacts/quiet-campus/PUBLIC_ROUTING.md` for the public opt-in and publishing
checklist. Neither Google approval nor public access was enabled by this change.

### Teammate module integration

The team's uploaded live-test report records three routes: 8 min 45 sec / 634 m,
8 min 52 sec / 639 m, and 10 min 17 sec / 745 m. This is the teammate's reported
test, not a new live test from this Replit integration. Reported values are not
hardcoded as live results.

After approval and public configuration, the user chooses endpoints and clicks **Find routes**.
Startup, selection changes, and sliders do not trigger a paid route request.
Changing endpoints cancels any pending request and hides stale routes. Successful
responses are scored locally until the user explicitly fetches again.

The frontend already has adapters for:

- Route IDs and campus endpoints.
- Duration and distance display.
- Encoded-polyline decoding.
- Drawing Google-returned geometry.
- Highlighting the recommended route.
- Selecting distinguishing waypoints using the teammate's decoded-path heuristic.
- Handling a single returned route without fabricating alternatives.

If real routes are enabled, sensory profiles are currently assigned from existing DEMO profiles by response order. They are **not observations of those actual routes**. This is a major limitation to address before treating recommendations as reliable.

### Navigation links

`buildGoogleMapsURL(route)` delegates to the teammate's `buildGoogleMapsUrl`,
which uses `URLSearchParams` to create a Google Maps Directions URL with:

- `api=1`
- Origin and destination
- `travelmode=walking`
- Candidate waypoints in route order

Each route card has a functional “Navigate with Google Maps” link.

Google Maps may independently recalculate the route or ignore waypoints. Exact route preservation is not promised. Real-phone navigation has not been tested by the agent.

## 6. Keys, permissions, and usage safeguards

**Secret names only — no credential values are included here.**

| Replit Secret | Purpose |
| --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | Public browser map key |
| `GOOGLE_ROUTES_API_KEY` | Private server-side Routes key |

Legacy aliases are also supported: `GOOGLE_MAPS_BROWSER_API_KEY` and `GOOGLE_MAPS_ROUTES_API_KEY`.

The browser key is necessarily visible to the browser. It must be restricted to **Maps JavaScript API** and approved website origins. The server key stays in the backend and must be restricted to **Routes API**. Never place it in frontend code.

Despite the browser key's `VITE_` name, this implementation supplies it through the backend configuration endpoint after map approval; frontend source does not read server secrets.

Independent non-secret switches:

```text
GOOGLE_MAPS_API_ENABLED=true     # Enable browser map loading
GOOGLE_ROUTES_API_ENABLED=false # Keep live walking-route requests disabled
```

At the time of this document, those are the development settings. They are not instructions to activate production usage.

Rules:

- Obtain explicit permission before live API use.
- Map approval does not imply Routes API approval.
- Do not activate billing or change Google Cloud settings automatically.
- Do not print keys, share secret files, or include key-bearing URLs in reports.
- Keep demo fallback functional.

## 7. Technical architecture and important files

The workspace is a pnpm monorepo.

| Area | Technology / location |
| --- | --- |
| Frontend | React + TypeScript + Vite, `artifacts/quiet-campus` |
| Backend | Node.js + Express 5, `artifacts/api-server` |
| API contract | OpenAPI, `lib/api-spec/openapi.yaml` |
| API client | Generated React client, `lib/api-client-react` |
| Backend validation | Generated Zod schemas, `lib/api-zod` |

Important implementation files:

```text
artifacts/quiet-campus/src/App.tsx
artifacts/quiet-campus/src/components/google-campus-map.tsx
artifacts/quiet-campus/src/lib/route-scoring.ts
artifacts/quiet-campus/src/lib/demo-routes.ts
artifacts/quiet-campus/src/lib/live-routes.ts
artifacts/quiet-campus/src/lib/google-maps-url.ts
lib/campus-routing/src/
lib/campus-routing/server/
artifacts/api-server/src/lib/google-routes.mjs
artifacts/api-server/src/routes/maps.ts
artifacts/api-server/src/routes/walking-routes.ts
artifacts/quiet-campus/GOOGLE_MAPS_SETUP.md
```

Backend endpoints:

- `GET /api/maps/config`: approved map configuration and separate route-enabled status.
- `POST /api/walking-routes`: the teammate adapter, explicitly disabled until separately approved.
- `GET /api/maps/routes`: retired endpoint; returns 410 with migration guidance.

No authentication, user-profile persistence, environmental-observation database feature, or trained machine-learning model has been added for this prototype.

## 8. Running and checking the app

Use the existing managed Replit workflows:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/quiet-campus run dev
```

Replit supplies service ports and base paths through the managed workflows. These commands alone are not a complete setup guide for running outside Replit.

Offline checks:

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/quiet-campus run typecheck
artifacts/quiet-campus/node_modules/.bin/tsx --test artifacts/api-server/src/lib/google-routes.test.mjs artifacts/api-server/src/lib/walking-routes.test.ts artifacts/quiet-campus/src/lib/*.test.ts
```

These tests use `tsx`, synthetic credentials, and mocked networking. They do not call Google. The original package's 27 tests can also be run from the uploaded ZIP; its `test:live` command must not be run without separate approval.

After editing the API contract:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Do not run live Maps or Routes tests simply to review this README.

## 9. What has actually been verified

- Frontend and backend TypeScript checks passed.
- Fifteen offline tests passed for weight totals, proportional redistribution, locking/unlocking, all 16 lock combinations, available-percentage limits, deterministic rounding, Reset, acceptance/ranking, time limits and ties, navigation URLs, and separate map/route approval.
- The official Google campus map loaded from the actual public Replit preview origin after the team updated HTTP-referrer restrictions.
- That browser test used one page navigation and resized the same page to 402 × 874 without reloading.
- No Google Maps authentication error occurred during that test.
- The Noise importance slider was changed from 40% to 41%; total importance stayed 100%.
- Acceptance controls, demo recommendations, route cards, and navigation controls remained available.
- Browser Routes API request attempt count was zero.
- A later small endpoint-framing adjustment passed TypeScript checks; no additional live browser pass was run for that adjustment.
- The Lock Weight layout was inspected at mobile width using a static server-rendered version of the actual controls. That check loaded no JavaScript or external assets; it did not make Google API requests.
- The teammate's 27 offline tests and 22 iSense offline regression/integration tests pass. Both production builds and TypeScript checks pass. A request to the running walking-route endpoint returns `ROUTES_DISABLED`/503, without contacting Google.
- An offline browser pass verified fetching, seconds/meters, three mock polyline records and their highlight styles, local rescoring without extra requests, lock/reset behavior, time constraints, route-specific navigation targets, changed-destination handling, and a 402-pixel layout. Google SDK and route responses were mocked; no live Google calls or phone navigation were tested in that pass.
- Time-eligible routes outside sensory acceptance levels are listed separately, without changing the scoring algorithm. Routes outside the maximum-extra-minutes constraint stay excluded.

The browser emitted a non-blocking deprecation notice for `google.maps.Marker`. Migration to Advanced Markers is future maintenance, not a current loading failure.

**Not verified:**

- Live Google Routes responses using the team's server key.
- Real route alternatives, durations, geometry, or route-line display from that live API.
- Zoom/pan interactions during the focused browser test.
- Real-phone Google Maps navigation.
- Accessible entrances and waypoint safety.
- Real environmental conditions.
- Production deployment behavior or a complete security/cost audit.

Earlier local screenshot tests produced `RefererNotAllowedMapError` because their origin was `127.0.0.1`. Restricted-key verification must use the real approved preview origin; do not remove website restrictions merely to satisfy a local screenshot tool.

## 10. Known limitations and questions worth reviewing

1. **Trust:** How should demo sensory data be presented so users never confuse it with measured conditions?
2. **Scoring:** Are the acceptance filters, thresholds, and weighted exposure/excess blend understandable and appropriate?
3. **User control:** Should nonmatching routes be hidden whenever a full match exists, or remain visible with warnings?
4. **Fairness of time normalization:** Should walking-time cost use the entire candidate set, the eligible set, or absolute extra minutes?
5. **Live-route sensory assignment:** How should simulated profiles be handled when Google returns new or reordered geometry?
6. **Teammate interface:** What is the smallest reliable contract for exchanging route data without duplicate routing systems?
7. **Safety:** What field-validation process is needed for sidewalks, crossings, entrances, and accessibility?
8. **API costs and security:** What additional quota, access-control, and abuse-prevention safeguards are needed before wider public use?
9. **Hackathon scope:** What should be prioritized for a credible demo without adding unnecessary infrastructure?

## 11. Suggested prompt to upload with this file

> Review the attached iSense README as a senior product engineer and UX reviewer. We are a beginner hackathon team continuing an existing React/Vite and Express app. Prioritize the three highest-impact improvements, explain why they matter, and give concrete acceptance criteria. Separate essential fixes from optional improvements. Pay special attention to importance versus acceptance, honest demo-data labeling, teammate routing integration, mobile usability, navigation safety, and Google API cost controls. Do not assume live Routes API testing has happened, invent environmental observations, recommend a full rewrite, or tell us to expose API keys. Ask for specific source files if a conclusion requires code inspection. Do not propose enabling live Routes API usage without explicit permission.

## 12. Time-aware direct sunlight

iSense now calculates daily UIUC sunrise/sunset locally with SunCalc, using the
trip's starting coordinates and the `America/Chicago` timezone. At night, direct
sunlight is estimated at zero and Sun is excluded from the effective scoring
weights and denominator. Saved Sun Importance, Sun Acceptance, locks and the
100% importance allocation remain unchanged; daytime scoring resumes at sunrise.
Noise/crowd acceptance, hard extra-walking limits and existing tie rules remain.
This does not measure shade, weather, nighttime lighting or route safety.

See [development simulation, tests and calculation limitations](artifacts/quiet-campus/TIME-AWARE-SUN.md).
Development-only `?preview=demo&solarTime=2026-10-10T17%3A00%3A00Z` simulates
daytime; change the instant to `2026-10-10T05%3A00%3A00Z` for nighttime.
The demo suppresses Google services; production ignores the solar-time override.
