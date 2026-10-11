# Physical sensory ranges — trial explanation layer

Noise: Low `<45`, Medium `45–<55`, High `≥55` dB(A), for usable dated
LAeq observations only. Missing/invalid/unsupported observations are Unknown.
These are product trial boundaries, not medical limits or validated UIUC
standards. WHO outdoor annoyance references use approximately 16-hour LAeq;
short samples cannot establish compliance. Never arithmetically average dB values
or invent a measurement duration.

Crowds: Empty requires reviewed simultaneous zero occupancy in a known area/time;
Low `>0–<0.18`, Medium `0.18–<0.45`, High `≥0.45` people/m².
Missing occupancy/usable area/location/time/quality, equipment failures, flow
counts and monthly totals are Unknown. Simplified FHWA walkway space thresholds
are not universal sensory tolerance standards.

Low acceptance accepts Low/Empty; Medium accepts Low/Medium/Empty; High accepts
known levels, not guaranteed safety. Unknown never confirms comfort. This
explanation is separate from Importance and from the existing 33/66/100 prototype
cutoffs. Ranking, weights/locks, Reset, time limits and raw source pipelines are
unchanged. Raw units are not mapped into 0–100 indices.

Compare options includes a keyboard-accessible range guide and dated historical
examples explicitly NOT linked to any route. Per-route physical conditions remain
Unknown because the existing route observations contain indices, not raw dB(A)
or simultaneous crowd-density observations. Pros/cons and recommendation text
qualify prototype matches rather than imply measured real-world comfort.

The reference JSON contains verbatim selected records, not regenerated
measurements: 3 noise examples (minimum / 75th-percentile ranked sample /
maximum) and the latest monthly report for each of 4 metrics. Those examples
are not averages, route summaries, or a claim of current conditions. Original
coordinates, values, source dates, sources and quality flags are preserved.
Source SHA-256 hashes are retained. Refresh offline, without changing sources:

```sh
node artifacts/quiet-campus/scripts/export-sensory-reference.mjs /path/to/feature-worktree
scripts/node_modules/.bin/tsx --test artifacts/quiet-campus/src/lib/*.test.ts
pnpm --filter @workspace/quiet-campus run typecheck
```

No paid requests or network fetches are made by extraction/classification. For
visual checking use `?preview=demo`, which does not load Google services. Public
availability does not establish redistribution permission; keep attribution.

References:
- https://www.who.int/publications/i/item/a68672
- https://www.fhwa.dot.gov/publications/research/safety/pedbike/98107/section3.cfm
- https://icap.sustainability.illinois.edu/project/pedestrian-and-bicycle-counts
