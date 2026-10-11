# iSense campus observation format (version 1)

No observations are pre-filled. Do not describe demo scores or Google route geometry as measured sensory evidence.

## Team workflow

1. Obtain routes only through the existing approved “Fetch walking routes” flow. Importing observations does not request Google routes.
2. Use “Export loaded path geometry” for coordinates in [latitude, longitude] order. Define stable, descriptive segment IDs, independent of route numbers, names or response order. Keep the ordered intervening coordinates and split long paths at the boundaries actually observed.
3. Collect observations for the full segment. Record the observation timestamp, source (team reference or field-sheet identifier), collection method and conditions (time of day, weather, event context). Use team aliases rather than personal details.
4. Record noise, crowds and/or sunlight as normalized exposure costs from 0 (lowest exposure) to 100 (highest exposure). These are not decibels, crowd counts, or UV index. Describe the rubric or normalization in `method`. Do not invent conversions or missing values.
5. Use `estimate` for unreviewed or inferred values. Use `verified` only after a team reviewer checks the evidence and normalization. Supply `reviewedBy` and `reviewedAt`; iSense validates those fields but does not independently verify your claims.
6. Import the completed JSON into the app. Invalid files are rejected without replacing the previous set. Inspect each route’s coverage and provenance. An imported file is only retained in that tab until reload; to share a reviewed set across users, commit it to `src/data/campus-observations.json` in the quiet-campus artifact and rebuild. No database is used.

## Structure

Download “empty format” for a valid starting file:

    { "version": 1, "segments": [], "observations": [] }

Each entry in `segments` requires:
- `id`: unique stable segment identifier.
- `name`: recognizable campus path/location description.
- `direction`: `forward` (only the ordered direction matches) or `both` (use only when evidence genuinely applies in both directions).
- `path`: at least two distinct consecutive [latitude, longitude] coordinates, in traversal order.

Each entry in `observations` requires:
- `id`: unique stable observation identifier.
- `segmentId`: an existing segment ID.
- `observedAt`: ISO 8601 date AND time with UTC `Z` or explicit timezone offset; no future dates.
- `source`: nonempty provenance / field-sheet reference.
- `conditions`: nonempty context; these historical observations do not describe current conditions.
- At least one of `noise`, `crowds`, `sunlight`. Omit dimensions not collected.

Each sensory dimension requires:
- `value`: finite number from 0 to 100.
- `status`: `verified` or `estimate`.
- `method`: nonempty description of measurement/estimation and normalization.
- `reviewedBy` and `reviewedAt`: mandatory for verified values. The review date must not precede the observation or be in the future.

The following is a structural worksheet, NOT valid observation data. Replace every uppercase placeholder with actual collected evidence; replace VALUE with a numeric exposure cost and COORDINATES with the exported array. Do not import the worksheet unchanged.

    {
      "version": 1,
      "segments": [{
        "id": "STABLE_SEGMENT_ID",
        "name": "CAMPUS_PATH_DESCRIPTION",
        "direction": "forward",
        "path": "COORDINATES"
      }],
      "observations": [{
        "id": "UNIQUE_OBSERVATION_ID",
        "segmentId": "STABLE_SEGMENT_ID",
        "observedAt": "ACTUAL_ISO_TIMESTAMP",
        "source": "FIELD_SHEET_REFERENCE",
        "conditions": "OBSERVED_WEATHER_TIME_EVENT_CONTEXT",
        "noise": {
          "value": "VALUE",
          "status": "estimate",
          "method": "ACTUAL_COLLECTION_AND_NORMALIZATION_METHOD"
        }
      }]
    }

Add `crowds` and `sunlight` in the same form only if collected. When changing a value to verified, also add real `reviewedBy` and `reviewedAt` details.

IDs and segment references are validated; unknown fields, invalid coordinates, duplicate IDs and invalid timestamps are rejected.

## Conservative matching and aggregation

- A whole segment must occur contiguously in the decoded Google path, matching coordinates rounded to six decimal places (~0.1 m). There is no nearest-path snapping, interpolation or extrapolation. Changes in path sampling can produce no match: keep DEMO DATA until the team validates and updates the segment geometry.
- A segment’s `both` direction explicitly permits a reversed match. Other segments only match forward.
- For overlapping observations, the latest observed timestamp wins separately per dimension on each covered edge. Equal timestamps use lexicographically smallest observation ID. Newer estimates may replace older verified measurements; the evidence status then reflects estimates.
- Values are weighted by geometric path length. Unobserved lengths use the same 50/100 DEMO DATA placeholder on all live routes, regardless of response order. This placeholder does not mean moderate exposure is known.
- Coverage is reported separately as verified, estimated and DEMO DATA for each dimension. Partial coverage is mixed, not a fully verified route. Scores may be fractional; displayed values are rounded but scoring uses the unrounded values.
- Paths with no matching observations remain explicitly DEMO DATA. Research fallback candidates have no verified geometry and cannot inherit observations from waypoint samples.
- Historical dates, conditions, sources, methods and reviewer details are available under each route’s evidence disclosure. There is no automatic time/weather adjustment or claim of present suitability.

The weighted scorer, independent acceptance levels, locked importance shares and maximum extra walking minutes are unchanged. Recommendations with demo or mixed evidence remain provisional. This format does not establish accessibility, entrance validity or safety.
