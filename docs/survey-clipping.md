# Survey polygon clipping

`@speleodb/map-core/survey-clipping` exports
`clipSurveyGeoJSONSteps(data, bound)`, a cooperative generator returning a
GeoJSON FeatureCollection of Points and LineStrings. It is an opt-in rendering
operation. The public web GIS View uses it before preparing renderer sources;
the library does not activate it for private viewers, mobile, or OGC clients.

This feature controls display only. It does not authorize access, filter server
responses, hide downloaded coordinates, or revoke original artifact URLs.
Applications own fetching the live bound, error presentation, and activation.

## Input and output

The bound must satisfy the existing GIS Geometry Polygon contract: a valid
simple 2D WGS84 outer ring, no holes or antimeridian crossings, at most 100
editable vertices, and a bounding box of at most 30 km². Invalid bounds throw
instead of returning unrestricted survey data.

Input may be a FeatureCollection, Feature, or bare geometry. Point and
LineString geometries are supported; MultiPoint and MultiLineString parts are
flattened into those primitives. Unsupported geometry types, including Polygon
and GeometryCollection, are excluded. Malformed points and complete malformed
line parts are excluded; valid sibling parts survive. Positions must contain
finite longitude/latitude, with optional finite elevation, inside the geographic
coordinate ranges. A line must use consistent position dimensions and cannot
cross the antimeridian.

Points on the boundary are included. Each line segment is partitioned at every
polygon intersection; midpoint classification retains only inside or boundary
intervals. This handles concave polygons, repeated entry/exit, vertices, and
collinear boundary overlaps. A tangent that touches only a single point creates
no zero-length line. Contiguous retained segments preserve intermediate survey
vertices; disconnected fragments never bridge an outside interval. New endpoints
linearly interpolate elevation when present. Geometry is planar in longitude and
latitude, consistent with the small, non-wrapping authoring contract.

Properties are retained without modification. Feature IDs are replaced with
deterministic `bound:<source-index>:<part-index>:<fragment-index>` IDs, unique
within the resulting collection even when source IDs repeat. Source IDs stored
inside properties remain unchanged. Coordinates are copied and inputs are never
modified. All source collection, feature, and geometry bounding boxes are
discarded so downstream camera and depth processing uses retained geometry.
Arbitrary foreign members outside properties are not copied. Normal IEEE-754
roundoff applies to computed intersection coordinates.

## Scheduling and validation

```ts
import { clipSurveyGeoJSONSteps } from "@speleodb/map-core/survey-clipping";

const displayed = await runPreparation(
  clipSurveyGeoJSONSteps(downloaded, polygon),
  { isCurrent: () => requestIsCurrent() },
);
```

Use the application's existing preparation runner to yield to rendering and
abort superseded loads. The generator checkpoints each source, part, position,
and emitted fragment, including empty containers. Every segment first rejects
nonintersecting bounding boxes and then examines at most the bounded polygon's
100 edges. Clipping does not change the caller's downloaded source or source
cache; cache the display result under a key that also identifies its bound if
the application retains results across different bounds.

`tests/survey-clipping.test.ts` covers boundary inclusion, outside crossings,
concavity, collinear edges, tangent-only contact, reversed rings, translated GPS
coordinates, elevation, multipart flattening, stable IDs, property preservation,
removed bounds, immutable inputs, malformed inputs, invalid bounds, and
cancellation within one large line. It runs with the full package Vitest suite,
type checking, linting, and browser compilation.
