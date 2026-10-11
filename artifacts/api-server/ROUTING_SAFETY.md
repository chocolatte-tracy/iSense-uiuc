# Team routing access and cost limits

Public iSense now uses the same routing module and durable ledger without a
visitor access code when `GOOGLE_ROUTES_PUBLIC_ENABLED=true`. The team-token
instructions below apply only to private/team mode. For the current production
configuration, units, defaults, and publish steps, see
[`PRODUCTION_SETUP.md`](../quiet-campus/PRODUCTION_SETUP.md).

No billing, Google API approval switch, or credential is changed by this feature.
Maps display (`GOOGLE_MAPS_API_ENABLED`) and Routes computation
(`GOOGLE_ROUTES_API_ENABLED`) remain independent approvals.

## Before approving Routes use

1. Apply the additive `routing_budget` schema to the existing PostgreSQL database
   with `pnpm --filter @workspace/db run push`. Apply it separately to the
    production schema through the reviewed publishing migration before release;
    do not overwrite production data or use an ephemeral filesystem ledger.
2. Add `ROUTING_TEAM_ACCESS_TOKEN` in Replit Secrets: a random, unguessable code
   at least 32 characters long, shared privately with trusted teammates. This is
   not the Google API key. Never use a `VITE_` variable for it. Revoking/rotating
   the code does not reset the ledger. No user accounts are required.
3. Configure `ROUTING_REQUEST_RESERVE_CENTS` as a positive integer conservative
   upper estimate of the charge per computation in US cents, based on the actual
   Google SKU and pricing for this project. There is deliberately no assumed
   price. Missing/invalid pricing fails closed.
4. Review the following optional positive-integer limits:

   | Variable | Default | Scope |
   | --- | ---: | --- |
   | `ROUTING_MAX_PER_MINUTE` | 3 | All teammates; fixed UTC minute |
   | `ROUTING_MAX_PER_DAY` | 10 | All teammates; UTC midnight reset |
   | `ROUTING_MAX_TOTAL` | 20 | Lifetime; never auto-resets |
   | `ROUTING_MAX_CONCURRENT` | 1 | Across all instances |
   | `ROUTING_BUDGET_CENTS` | 100 | Lifetime estimated cost reserve |

5. Set an exact `ALLOWED_ORIGINS` list for published hosts if needed. Origins are
   an additional browser restriction, never proof of authorization.
6. Restart the API after configuration changes. Only enable the Routes approval
   switch after explicit owner approval. Configure Google-side quotas as a second
   safety layer, including other apps using the same Cloud project.

## Teammate use and feedback

Enter the team code in the password field before clicking Fetch walking routes.
It is held only in page memory, sent in the Authorization header over HTTPS,
and never saved in local/session storage or included in map configuration.
Refresh clears it. Do not share it with untrusted/public users.

Unauthorized calls return `401 UNAUTHORIZED`. Database/schema failures return
`503 BUDGET_UNAVAILABLE`; absent/invalid reserve settings return
`503 BUDGET_NOT_CONFIGURED`. Budget/lifetime exhaustion returns
`429 SPENDING_LIMIT` and requires owner review, not a restart. `DAILY_LIMIT`,
`RATE_LIMIT`, and `ROUTING_BUSY` explain when to try again manually.
Messages are displayed in the app and demo fallback remains available.

Atomic reservations are committed **before** invoking Google. All potentially
billable attempts, including timeout, network errors, rejected responses, and
client cancellation, consume the reserve without refunds or automatic retries.
Only concurrency is released. A crashed worker's lease expires after 60 seconds;
the upstream request has a hard 12-second timeout. Minute, day, lifetime, and
cost counters survive restarts and are shared across server instances.

This is an application request/cost-reservation cap, not Google's invoice or a
guarantee against pricing changes, external use of the key, or Maps JavaScript
charges. The owner must keep the reserve estimate conservative. Raising limits
requires explicit owner review. Do not delete/reset the ledger to bypass a cap.

## Offline verification

Routing tests inject synthetic keys, synthetic team codes, and mocked Google
responses. Budget integration tests use temporary rows in the existing
development PostgreSQL database and remove only those rows afterward.
No live Google request is needed to verify these safeguards.
