# Source provenance and access, checked 2026-10-11

## Champaign LiDAR

- Catalog: https://clearinghouse.isgs.illinois.edu/data/elevation/illinois-height-modernization-ilhmp
- Dataset XML: https://clearinghouse.isgs.illinois.edu/distribute/district5/champaign/2020/Champaign_2020_metadata.xml
- DSM: https://data.isgs.illinois.edu/arcgis/rest/services/Elevation/IL_Champaign_DSM_2020/ImageServer
- DTM: https://data.isgs.illinois.edu/arcgis/rest/services/Elevation/IL_Champaign_DTM_2020/ImageServer
- Metadata access constraints: “No restrictions apply to these data.” Use
  constraints: “None.” Metadata warns of subsequent surface changes and requests
  USGS acknowledgement. Attribution: USGS, Illinois State Geological Survey /
  Prairie Research Institute, University of Illinois Urbana-Champaign.
- Raw source XML, ArcGIS metadata, numeric exports, requests and hashes retained.
  This experiment downloaded only two 1.2 km-square rasters, not the county archive.

## Melbourne hourly pedestrian counts

- Dataset: https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/
- API: https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-monthly-counts-per-hour
- Sensor metadata: https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-sensor-locations/records
- Attribution: City of Melbourne. The live dataset metadata had null `license`
  and `license_url`; a government resource catalog labels it `other-open`.
  We did not establish a specific redistribution/commercial-training license.
- Raw data, predictions and trained parameters remain local research material.
  Do not automatically upload the entire cache or model to a public repository.
  Confirm source terms before external redistribution/deployment.
- Export query fixes 8 stations, Jan–March 2025 and a 20,000-row ceiling. A separate
  count query verifies that the export did not truncate. The per-file provenance
  sidecars preserve exact query and SHA-256. The importer checks location changes,
  duplicate conflicts, direction sums and invalid/negative targets.
- Live API now has `location_id` and directional columns although prose still
  mentions `sensor_id` and unavailable directions. Code follows actual schema.

## UIUC fine-grained data: not acquired

2022 report, page 4, describes 15-minute data available to students, faculty and
staff on request. This is not a public bulk download, nor confirmation of today's
availability: https://icap.sustainability.illinois.edu/files/ssc-project/9836/Bike%20and%20Ped%20Counters%20SSC%20final%20report.pdf

Use `uiuc-15minute-template.csv` for an authorized export. Ask for timestamp/offset,
station identity and coordinates, separate pedestrian vs bicycle counts, missing
and zero distinctions, maintenance flags, relocation history, and reuse terms.
No request/email was sent by this pipeline. Existing monthly counts stay monthly.

## Solar algorithm

NOAA General Solar Position Calculations:
https://gml.noaa.gov/grad/solcalc/solareqns.PDF

## Not downloaded or trained here

NOAA meteorological data, Quiet Project, SONYC audio. These remain candidate future
inputs; they are not silently represented in the trained model's features/results.
