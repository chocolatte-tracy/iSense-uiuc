# iSense mobile interaction and ranking review

## Scope and limitations

This is a revision of the existing React/Vite iSense PWA, not a second app or
routing engine. The Express API, teammate's Google routing module, API keys,
production flags, database, persistent budget ledger, daily quota, per-client
limits and emergency switches remain unchanged. Publishing is a separate
owner action; development edits do not update an installed production PWA.

The intended users include autistic and sensory-sensitive UIUC students.
Keep control predictable: one screen, one purpose, details on demand. A route
recommendation is not a guarantee of comfort, accessibility, or safety.

## Current crowd-data audit

- `src/data/campus-observations.json` currently has **zero segments and zero
  observations**. No live route can claim mapped current crowd measurements.
- Historical noise and pedestrian source examples are not mapped route
  exposures. The 97 NoiseCapture points cover about 5.9 × 5.5 m, not a campus
  route; original dB(A) values must never be relabeled as normalized costs.
- `applyCampusObservations` retains the existing conservative geometry-match,
  direction, per-metric observation selection and length-weighted coverage.
  Provider response array order and route IDs are not observation keys.
- Live unmapped lengths retain the existing `50/100` DEMO placeholder in route
  data. This was previously scored like an observed value, so an unknown
  candidate could appear less crowded than a known high-exposure candidate,
  and a placeholder could appear to satisfy acceptance. That is a confirmed
  trust/uncertainty problem, not evidence that a named street is always busy.
- For ranking only, the unmapped contribution now uses an upper bound:
  `ranking exposure = max(0, stored cost - 50 × unknown fraction) + 100 ×
  unknown fraction`, bounded at 100. A fully missing metric therefore ranks
  at an uncertainty bound of 100 but displays **Unknown**, not “100 measured”.
  A half-observed crowd metric at 20 with half unknown retains displayed
  blended DEMO cost 35, but ranks conservatively at 60. Research DEMO routes
  keep their supplied synthetic values.
- This conservatism may penalize a genuinely comfortable but unmeasured
  route. That tradeoff is deliberate: absence of data must not be presented
  as evidence of low exposure. It does not establish the real condition.
- Missing or invalid values cannot produce NaN costs or quietly become zero.
  Incomplete/estimated/demo evidence produces a **provisional** result;
  unknown comfort status is distinct from a known exceeded cutoff.

The existing acceptance cutoffs remain 33 / 66 / 100. The existing sensory
penalty remains `0.25 × exposure + 0.75 × normalized excess above acceptance`.
Weights, locks, time normalization, acceptance-first filtering and the hard
extra-walking limit are unchanged. Night excludes direct sunlight and its
effective weight without changing saved preferences; it says nothing about
street lighting or safety. Equal scores use walking time then geometry instead
of a provider response-local ID.

If all live routes have missing sensory observations, their uncertainty costs
are equal. Walking time is then a tie-breaker: the winner is a provisional
candidate, **not** a proven quietest or least-crowded route. With zero weights,
walking time is the explicit fallback.

Google supplies a limited set of walking candidates, not every possible
campus path and not sensory-optimized alternatives. A recommendation is only
among the returned candidates satisfying the current hard constraints.

### What is not established about Green Street

No captured provider response identifying the user's particular Green Street
alternative and active preferences was found. Original candidate research
names and synthetic fixtures are not a verified replay of that trip.
Consequently, the exact cause of that individual recommendation is unknown.
Do not add a street-name penalty or infer crowd density from the hour.

The offline illustrative fixture has:

| Synthetic candidate | Minutes | Meters | Crowd | Noise | Sun | Provenance |
|---|---:|---:|---:|---:|---:|---|
| Green Street test candidate | 9 | 634 | 80 | 60 | 20 | Synthetic full-coverage fixture |
| Lower-crowd test candidate | 10 | 700 | 20 | 20 | 55 | Synthetic full-coverage fixture |
| Third test candidate | 11 | 780 | 45 | 35 | 80 | Synthetic full-coverage fixture |

With crowd importance 100%, other importance 0%, acceptance High, and extra
walking 3 minutes, the synthetic lower-crowd candidate wins (cost 5 versus
20 and 11.25). Noise 100% also selects it. Walking 100% and all-zero importance
select the nine-minute candidate. Crowd Low filters to the lower-crowd route.
Extra walking 0 minutes excludes the two longer alternatives, even if they
have better sensory values. These are mathematical regression fixtures, not
UIUC field observations.

Run the detailed offline audit:

```sh
scripts/node_modules/.bin/tsx artifacts/quiet-campus/scripts/audit-ranking.ts
```

`auditRouteRanking()` exposes each candidate's duration/distance, weights,
acceptance, eligibility, coverage/provenance, ranking cost and winner/exclusion
reason. It does not make requests. Score breakdown contributions sum to the
actual score, rather than reimplementing a second scoring formula.

## Search interaction contract

Search is a full-screen transaction for exactly one endpoint. Draft text is
not a resolved place. Cancel leaves both selected endpoints and existing
results unchanged. A campus suggestion needs existing verified coordinates;
a Google prediction needs successful Place Details with an ID and supported
coordinates. Only then may selection commit one complete location object.

Selection must not depend on an input blur racing a suggestion click. Loading
must remain visible while coordinates resolve; later searches/cancellations
invalidate stale responses. A valid selection invalidates old trip routes
but does not request new routes. Only Find Routes may do that. Swap preserves
complete endpoint objects. Preferences re-rank locally without paid requests.

The original inline dropdown closed on blur with an absent/outside
`relatedTarget`, removing suggestions before a later click could select.
This is a reproducible failure path; it is not a claim of testing the user's
physical iPhone. The full-screen list is not dismissed by input blur.

## Weather and time: truthful boundaries

Sunrise/sunset/departure-phase estimation is implemented locally. Weather is
currently **not connected to a live provider**. The interface should say
weather unavailable; do not claim temperature, cloud conditions, shade
measurements, or weather-driven cost changes have been validated. No weather
service was added or billed during this revision. The weather/daylight sheet
explains these limitations. Time-phase tests cover nighttime exclusion and
daytime restoration, not live-weather prediction.

## Community Reports and a future data pipeline

Existing shared PostgreSQL reports preserve ID, latitude, longitude, location
label, subjective noise/crowd choices, observation timestamp and creation
timestamp. Existing server validation and request limits remain in place.
Reports stay informational and **do not affect ranking now**.

Future design only:

1. Report with consent and validated coordinates/time.
2. Associate to a route segment using explicit proximity/direction rules.
3. Apply timestamp freshness and context weighting.
4. Aggregate multiple independent reports; reject duplicates/outliers, assess
   source quality and document confidence/coverage.
5. Produce a clearly labeled estimated segment exposure, retaining provenance.
6. Evaluate the existing rule-based ranking with those estimated exposures,
   never silently promoting subjective reports to verified conditions.

Before implementation, define retention/privacy, abuse resistance, minimum
sample counts, freshness windows, calibration and uncertainty handling. No
aggregation job, report-to-score connection, or machine-learning model was
implemented in this revision.

## Changed files and responsibilities

| File (under `artifacts/quiet-campus/` unless noted) | Reason |
|---|---|
| `src/App.tsx` | Search-open state, background inertness and navigation visibility. |
| `src/components/location-search.tsx` | Cancel-safe full-screen draft, reliable touch selection, async guards and focus handling; no query just from opening a confirmed endpoint. |
| `src/components/map-screen.tsx` | Confirmed endpoint triggers, full-screen search integration and compact map planning. |
| `src/components/environment-context.tsx` | Compact weather/daylight pill and clear unavailable state. |
| `src/components/comfort-preferences.tsx` | Requested “Any sunlight” label; underlying thresholds unchanged. |
| `src/components/routes-screen.tsx` | Provisional/unknown summaries and score/evidence details. |
| `src/components/reports-screen.tsx` | Exact future-purpose notice; existing shared report behavior retained. |
| `src/mobile-pwa.css`, `src/native-screens.css` | Remove competing shell/navigation geometry; native layout owns safe-area padding and full-screen search scrollports. |
| `src/lib/route-scoring.ts` | Conservative unknown inputs, acceptance status and actual score breakdown; stable geometry tie-break for live routes. |
| `src/lib/ranking-evidence.ts` | Separate measured/demo display values from ranking uncertainty. |
| `src/lib/route-ranking-audit.ts` | Read-only candidate diagnostics using the same ranking result. |
| `src/lib/route-tradeoffs.ts` | Unknown metrics cannot generate reassuring sensory pros from placeholder numbers. |
| `src/lib/ranking-fixtures.ts`, `src/lib/ranking-audit.test.ts` | Clearly synthetic audit data and eleven focused regression checks. |
| `scripts/audit-ranking.ts` | Offline printable fixture audit; no network client. |
| Root `README.md`, `docs/isense-mobile-ranking-review.md` | Review link, source/uncertainty boundaries, future Reports plan and release instructions. |

The previous source existed in two competing shell/navigation CSS layers.
Removing those duplicate minimum-height/positioning/padding declarations
lets native screen CSS own the geometry; no negative bottom offsets were
added. The unchanged visual-viewport hook supplies keyboard height/top.

## Completed verification

- Workspace typecheck passed; the final frontend typecheck passed.
- **139/139** offline regression tests passed, including the original routing
  harness and eleven new ranking/tradeoff checks.
- Production build passed; PWA verification passed with **15 static precache
  entries**, zero external assets and no runtime API/Maps cache.
- One mocked-provider browser pass covered Main Library touch selection after
  null-relatedTarget focusout, parent refresh during Details, missing
  coordinates, no results, permission failure, cancellation and ignored late
  resolution. Opening an already confirmed endpoint made zero autocomplete
  calls; typing the test query made one mocked autocomplete call.
- Find Routes made **one mocked POST**; changing weights/locks/tolerances/extra
  walking and swapping did not add requests. Reports draft cancellation made
  zero report POSTs and no database writes.
- 375×812, 393×852, 430×932 and 852×393 had no horizontal document overflow and
  a measured zero bottom-navigation gap. A separate development-only 393×852
  screenshot checks simulated 59px top/34px bottom safe areas.
- Keyboard simulation used a 500px visual viewport with 35px top offset.
  Results scrolled (410px content / 254px visible), Back stayed reachable, and
  tabs were hidden. Closing restored the full viewport and navigation.
- Enlarged-text and standalone-media simulations were performed. These are
  browser simulations, **not physical iPhone or installed-PWA verification**.

Screenshots were captured for Map, keyboard Search, confirmed Main Library,
Preferences, Routes, Reports, landscape and enlarged text. Google tiles/SDK
and app API responses were mocked; the blank map fixture is not a substitute
used by production code. Navigation URL was inspected, not tested on a
physical phone. No live Places or Routes API test was performed in this
revision; weather remains unavailable and was not inferred.

## Verification and release commands

```sh
pnpm run typecheck
scripts/node_modules/.bin/tsx --test artifacts/api-server/src/lib/*.test.ts artifacts/api-server/src/lib/*.test.mjs artifacts/quiet-campus/src/lib/*.test.ts
PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build
pnpm --filter @workspace/quiet-campus run verify:pwa
```

Browser checks must mock Maps/Places/Routes before opening the page; offline
passing behavior is not proof of live provider authorization. Required
physical checks remain Safari/PWA keyboard animation, Dynamic Type, the real
home indicator/notch, geolocation permission and Google Maps handoff.

After reviewing the development preview, the owner must republish the
existing app through Replit's Publishing interface, preserving the current
domain and production secrets. Do not enable another API call to verify this
UI update. In an installed PWA, accept its explicit update when offered,
reopen, and check the new search/navigation behavior; do not clear the shared
database or routing ledger.
