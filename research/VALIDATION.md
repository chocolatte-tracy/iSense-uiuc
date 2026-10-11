# v2.3 validation — 2026-10-11

Base: chocolatte-tracy/iSense-uiuc main, 2aa91962a2ce31816da195eb229bfe7a85a604ab.
Remote main was checked again after implementation and still matched this commit.
No remote commit, push, PR or deployment was performed.

| Check | Result |
|---|---|
| Workspace TypeScript checks | PASS: API, app, mockup workspace, scripts and shared libraries |
| Node offline regression suite | PASS: 145 tests, including 7 new adapter/UI tests |
| Existing real PostgreSQL reservation test | NOT VALIDATED: no local PostgreSQL server; full-suite attempt failed this one test; final offline command explicitly excludes it |
| Python suite | PASS: 28 of 30 tests; 2 Melbourne-cache tests explicitly skipped because that private cache/model is excluded |
| TypeScript → Python → TypeScript round trip | PASS: day, night and DST instants; synthetic geometry with acquired terrain; costs/ranking unchanged |
| Frontend production build | PASS: Vite + PWA service worker |
| API production build | PASS |
| PWA static verification | PASS: 15 precached static assets, no external API assets or detected credential patterns |
| Browser export/compute/import | PASS: actual RoutesScreen/DetailsSheet components in a temporary synthetic fixture harness |
| Browser old-result rejection | PASS: same provider ID, duration changed from 185.25 s to 200 s; old result refused |
| Browser layout | Inspected research section at 390 × 844; file chooser and explanatory text fit the panel |
| Patch replay | Independently verified during packaging against an archive of the pinned base; see handoff manifest |

The browser used the real native detail components and local file chooser, with
synthetic non-navigable geometry. A browser-downloaded request was passed through
the Python runner and the produced file imported back. No live Google search was
performed. The temporary harness is not part of production or this source package.

For its synthetic daytime path the model displayed 53.3% direct-sunlit length,
100% numerical support, and rankingEligible=false. This is a software integration
check, NOT a real-route measurement, a shade-accuracy estimate or a claim of
improved prediction accuracy. The stored departure remains explicitly a snapshot.

The exact changed code does not write route costs, sensory evidence, preferences,
Google configuration, budget limits or any database. Unit tests additionally
assert route/preferences/ranking equality before and after prediction import.

Platform accommodation: the upstream workspace intentionally excludes macOS
native esbuild/Rollup/LightningCSS/Tailwind binaries. Matching versions were
installed in a separate local harness and symlinked into ignored node_modules.
No production package.json, lockfile or supply-chain policy was changed.

Not tested: deployed Replit server, real Postgres durability, real mobile Google
navigation, paid Google routes, field sunlight accuracy, UIUC hourly crowd model.
Historical Melbourne metrics were not retrained or re-evaluated in this turn.
