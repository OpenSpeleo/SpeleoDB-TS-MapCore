# Coordinate bounds and validation ownership

`createCoordinateBounds` from `@speleodb/map-core/coordinate-bounds` accumulates
finite longitude/latitude positions for camera fitting. Call `extend(position)`
during an existing geometry traversal, then consume `finishSteps()` with the
shared preparation runner. Small synchronous consumers can call `finish()`. No
renderer, worker or application configuration is required.

With `wrapLongitude: true` (the default), arbitrary finite longitude values are
normalized modulo 360. The largest sorted circular gap determines the containing
arc. Equal gaps keep the first gap in sorted order. The output uses unwrapped
corners, so east can exceed 180 and a point at the antimeridian is represented
as positive 180. `wrapLongitude: false` preserves the full numeric extent for
non-wrapping authoring geometry. Invalid/nonfinite positions are ignored; empty
input returns null without inventing a camera destination. Latitude is neither
range-validated nor clamped by this accumulator.

`decodeGeoJSONBBox` reads the first two axes of a finite even-dimensional bbox
and unwraps east by one turn when east precedes west. Passing its result as
`bbox` makes metadata authoritative and skips coordinate accumulation. Whether
to trust metadata is a caller decision. Web preserves its existing bbox-first
contract; mobile survey validation deliberately measures the actual geometry.

The cooperative finalizer yields while copying longitudes, during every merge
sort output and during the gap scan. It never invokes an uninterruptible
`Array.sort` over the complete dataset. Sorting uses two scratch arrays so a
cancelled computation cannot partially overwrite accumulated positions. Memory
is O(n) and sorting is O(n log n); geometry itself is neither copied nor scanned
again. Callers should not add positions while a finalizer is running.

Web's project preparation feeds the accumulator during its existing combined
depth, altitude and snap-point pass. This preserves one geometry traversal. The
synchronous web adapter uses `geometryPositionSteps` and constructs a real
renderer bounds object only after the shared calculation. Each adapter retains
its existing treatment of malformed features and its scheduling policy.

This contract is distinct from `geographic-bounds`' strict directed longitude
intervals. Those validate longitude ranges, choose canonical endpoints/ties and
merge entire covered arcs, including full-world intervals. Combining project
extents must preserve arc coverage; treating interval endpoints as mere points
can discard covered territory. Mobile's strict GeoJSON shape/range validation,
closed-ring checks, footprint limits and quarantine errors remain app policy.

Tests characterize wrapped/unwrapped coordinates, out-of-range finite
longitudes, ±180, antipodal ties, duplicates, altitude, nested/empty geometry,
bbox authority, malformed bbox axes, source immutability, cancellation and
recomputation. Application tests retain renderer object construction, strict
rejection rules and fused preparation behavior.
