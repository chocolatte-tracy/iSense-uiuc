# iSense teammate routing module

The four JavaScript implementation files in `src/` and `server/` are imported
unchanged from the team's uploaded `quietcampus-routing.zip`. Only declarations
and workspace metadata were added for React/TypeScript integration.

The existing iSense Express app mounts `createRouteHandler` once. Do not start
another server. Browser code may import only `routing` and `waypoints`; `proxy`
is server-only. No `.env`, credentials, standalone UI, or images are included.

The original package and all its offline tests are retained in the uploaded ZIP.
The team's report documents a successful live test; it is not evidence that a
new Google Routes request has been made or tested from this Replit integration.

Waypoint selection is a geometric heuristic. It may interpolate positions along
decoded route segments. It does not establish accessibility, sensory suitability,
or exact Google Maps navigation behavior.
