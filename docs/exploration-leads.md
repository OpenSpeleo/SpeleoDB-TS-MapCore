# Exploration lead directions and checked status

Exploration lead point features carry `properties.directions`, an ordered array
of one to three `{ heading, checked }` entries. A heading is a finite bearing in
`[0, 360)`, clockwise from geographic north, or `null` when unset. Each entry's
boolean `checked` belongs to that entry, including when its heading is unset. An
undirected ExplorationLead contains one null-heading entry rather than an empty
list. Duplicate headings remain independent entries.

`parseExplorationLeadDirections` validates the complete array and returns copied
entries, or `null` for malformed data. It never silently drops an invalid entry,
which could otherwise hide an unchecked lead.
`createDefaultExplorationLeadDirections` creates one undirected, unchecked
entry. `isExplorationLeadFullyChecked` returns true only for a non-empty array
whose entries are all checked. This calculated state is not a separate
persistence field.

`buildExplorationLeadCones(featureCollection)` derives one Polygon for each
unchecked entry with a non-null heading on a Point. Checked and undirected
entries contribute no cones. Each sector has a fifteen-metre geodesic radius and
a 45-degree opening. Coordinates remain on the origin's longitude branch near
the antimeridian, avoiding a polygon spanning the world. Source data and
properties are unchanged; each polygon retains source properties and receives a
distinct ID derived from its source feature ID and original direction index. The
original index remains stable across checking/unchecking sibling entries.

This is a ground-scale annotation, so it shrinks with map zoom and has no
minimum pixel size. The shared renderer owns red fill, opacity, marker
completion styling and visibility filters. Applications own persistence,
permissions, source registration and lifecycle. Derive once when source data
changes, not when display preferences change. Work is linear in lead count with
bounded vertices per direction.

The current API uses structured directions only. Migration of previously saved
numeric heading arrays belongs to the application that owns those persisted
records, not to a permanent fallback in the map contract. Import identity and
project matching are independent of headings and checked status.

Tests cover every checked-state combination for one, two and three entries;
nullable and duplicate bearings; invalid-record rejection; direction and metric
size at multiple latitudes; antimeridian continuity; source immutability; and
original per-direction cone IDs.
