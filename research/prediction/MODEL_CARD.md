# iSense research models — v2.3 app integration, v2.2 experiment results

## Actual purpose and status

Offline reproducible research. These outputs are physical evidence for inspection,
not registered 0–100 indices. `rankingEligible` remains false. v2.3 adds an offline
export/import display in the actual GitHub app at main 2aa9196, without altering
ranking. No Google request was made. Crowd metrics below are the prior v2.2
experiment, not a newly trained UIUC model. Its raw cache/models are excluded
from this public handoff; see ../README.md for the exact package scope.

## Pedestrian model

- Source: City of Melbourne, hourly pedestrian counting system. Count of passages
  through a sensor, not distinct people, occupancy or people per square meter.
- Fixed cohort: location IDs 1,2,3,4,8,9,10,12. These were chosen by ascending ID
  among presently active stations with installation before the experiment and no
  current note, before retrieving outcomes. This creates potential survivorship
  bias. Current metadata does not prove historical maintenance quality.
- Collection window: 2025-01-01 inclusive to 2025-04-01 exclusive, local Melbourne
  dates/hours. This window does not cross the April DST change. Other windows need
  explicit ambiguous/missing-hour handling, not this hardcoded benchmark importer.
- 17,032 rows; missing hours: 149 at station 8, 94 at 10, 5 at 12. No targets were
  imputed. The actual sample contains no zero counts; importer tests preserve zeros.
- Fit: 8,402 rows at six stations, Jan 1–Feb 28. Validation: 2,280 rows, March 1–16.
  Future test: 2,129 rows, March 17–31. Unseen-station test: 708 rows at IDs 10/12,
  March 17–31. Earlier held-out station rows are unused; not fitted or tuned on.
- Features: hour, weekday, month, latitude, longitude. No current target, lagged
  live feed, weather, holiday or event features. This is a calendar-based future
  hourly count profile, not operational real-time nowcasting.
- Candidates: station/weekday/hour training mean (fallback global weekday/hour),
  Poisson HistGradientBoosting with 8/15 leaves, 120 iterations, fixed seed 42.
- Select by validation MAE only. Selected **weekday/hour baseline**, validation
  MAE 148.67 vs best boosting 153.52. No refitting on validation or test.
- Future-test selected MAE 143.29 passages/hour, WAPE 16.29%; best boosting MAE
  145.19, WAPE 16.50%. These are errors, not accuracy percentages.
- Unseen-station selected MAE 589.65, WAPE 294.23%; best boosting MAE 538.04,
  WAPE 268.48%. **Poor spatial transfer. Do not deploy to UIUC.**
- A validation 90th-percentile absolute residual band is descriptive only. It
  empirically covers 89.85% of familiar-station test rows but 48.73% of held-out
  station rows. This is not an iid/conformal coverage guarantee.
- Prediction CLI refuses stations outside training domain. Out-of-period
  predictions are marked outside the evaluation period; even in-period output is
  research-only. Full results, per-station errors and missingness remain in the earlier private v2.2 package.
- Models export to JSON (no pickle execution). Export predictions are checked
  against pinned scikit-learn on all 17,032 inputs. Dependence on private sklearn
  tree internals is isolated to the exporter and protected by the parity test.

## Sunlight model

- Champaign 2020 named product; actual collection 2019-11-23 through 2020-03-08.
  Source native pixels 2 US survey feet, vertical NAVD88/GEOID12B in US survey feet.
- Official DSM and DTM numerical F32 GeoTIFFs exported in EPSG:32616, 600×600
  pixels at 2 m. Campus Main Quad center approximately -88.2272,40.1089, 1.2 km square.
  Vertical conversion is 1200/3937 m per US survey foot; TIFF georeferencing checked.
- NOAA approximate geometric solar position; true north corrected to UTM grid
  north. Receiver 1.5 m above DTM. Surface treated as opaque. Sampled rays at half
  pixel spacing, up to 300 m; route samples at 5 m arc-length bins. Walking speed
  assumed constant, sun evaluated at each sample's arrival time.
- NoData/outside rays yield unknown unless a known obstruction already proves
  blocking inside the model. Sun elevation 0–10 degrees is unsupported. Geometric
  sun below horizon is reported as night, not shade.
- Sunlit fractions/minutes bounds represent **missing support only**, not model
  error. Full coverage is not full accuracy. Obstacles outside 300 m are not modeled.
- Winter canopy, 2 m resampling, historical changes, leaf transmission, clouds,
  indoor/bridge geometry and surface simplification limit accuracy. No prediction
  of temperature, UV or physiological comfort is claimed.
- Default three transects are diagnostic straight lines and may cross buildings.
  They are not asserted walkable and do not compare valid route alternatives.
  The CLI accepts existing full WGS84 route geometry for later local evaluation.
- Synthetic wall/clear/NoData/night tests check software behavior. No field shade
  measurements were available to evaluate model accuracy.

## Next evidence needed

Obtain UIUC 15-minute pedestrian records and maintenance notes, save full route
geometry, verify daylight/shade at representative routes and times. Then train and
test UIUC-specific models. Weather features may improve performance but were not
added in this version. Noise remains the original localized measurements and
traffic proxy; no foreign sound classifier substitutes for campus dB measurements.
