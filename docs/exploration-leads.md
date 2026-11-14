# Exploration lead directions

Exploration lead point features carry `properties.headings`, an ordered array of
up to three finite bearings in `[0, 360)`. Zero points north; bearings increase
clockwise. An empty array means no direction. `explorationLeadHeadings` accepts
unknown overlay metadata and returns a fresh bounded numeric array. Missing
metadata in previously cached overlays is displayed as no direction.

`buildExplorationLeadCones(featureCollection)` derives one Polygon for each
valid heading on a Point. Each sector has a fifteen-metre geodesic radius and a
45-degree opening. Coordinates remain on the origin's longitude branch near the
antimeridian, avoiding a polygon spanning the world. Source data and properties
are unchanged; each polygon retains source properties and receives a distinct ID
derived from its source feature ID and direction index. The feature is
decorative: source identity, permissions and persistence remain app-owned.

This is a ground-scale annotation, so it shrinks with map zoom. It has no
minimum pixel size. The shared renderer supplies red fill, opacity and zero
simplification tolerance; applications own source registration, marker ordering
and visibility filters. Derive once when source data changes rather than when
display preferences change. Work is linear in lead count with bounded vertices
per direction.

Tests cover direction, metric size at multiple latitudes, unset/invalid values,
antimeridian continuity, source immutability and distinct per-direction IDs.
