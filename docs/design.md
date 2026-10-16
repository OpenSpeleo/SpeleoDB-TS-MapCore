# Portable map domain design

The web application renders individual project sources through imperative map
controllers. Mobile combines project overlays in React and stores source data
for offline use. Sharing controllers would couple two lifecycle models and risk
changing permissions, source identity and offline behavior. The package instead
owns transformations of data and the invariants both applications enforce.

## Policy boundaries

- GIS geometry validation is identical on both clients. The server remains the
  authoritative contract owner; both clients execute this implementation and web
  tests compare package snapshots with server constants and fixtures.
- Bounds operations distinguish geographic intervals from display projection.
  Directed arcs preserve interval coverage across the dateline. Editable GIS
  geometry has a deliberately stricter no-crossing rule.
- Depth helpers accept parsers, property names and resolver callbacks. Web's
  numeric-prefix parsing and section-point average fallback differ from mobile's
  strict aliases and coordinate-Z average. Those policies remain app code.
- Landmark grouping owns accumulation and ordering mechanics. The web adapter
  supplies collection permissions and case-sensitive labels; the mobile adapter
  derives collection metadata from cached GeoJSON and uses case-insensitive
  names. Grouping never grants permissions.
- Visibility expresses individual intent AND country gate AND readiness.
  Preference storage, defaults, source admission and state transitions remain
  application responsibilities. Closing a gate does not overwrite individual
  choices.

## Work scheduling and ownership

Geometry generators yield within positions and containers, including empty
nested collections. Processing a single large feature cannot bypass scheduling
checkpoints. The scheduler factory owns a CPU allowance per instance; web shares
one instance across parallel project preparation. Mobile selects a step budget
and suppresses the initial yield to preserve its small-source fast path.

The scheduler checks cancellation before work, after yielding and before
publication. Applications decide how to handle the AbortError and when to cache
completed results. Source caches remain tied to immutable source revisions and
the policy of their owning viewer; neither package keeps a cross-app singleton
cache. Changing visibility or color mode uses precomputed domains instead of
rescanning geometry.

Topology validation bounds the input to 100 vertices before intersection
checking. Interval merging sorts interval endpoints. Collection grouping is
linear apart from sorting each group's output. Traversal does not duplicate
coordinate arrays unless the caller requests altitude flattening.

## Verification boundaries

Package tests own algorithm cases: geometry fixtures and limits, malformed
coordinates, dateline interval coverage, color validation, depth arithmetic,
landmark grouping and cooperative scheduling. App tests own parsing policies,
state, data identity, cancellation publication and renderer integration. Web
also checks package/server fixture equality and the entire public import closure
through shared package exports, including worker and dynamic import edges.

A passing unit suite does not verify a provider's live style or real WebGL
behavior. Those remain application browser checks with the pinned MapLibre
engine and a separate live provider resource probe.

## Geometry labels and landmark icons

Optional geometry aliases use the server contract's 32 Unicode code-point limit.
`createGeometryLabelFeature` derives one label point per saved geometry: lines
use half the full projected path length; polygons use an interior
pole-of-inaccessibility position. Coordinates are normalized before polylabel;
extremely thin polygons use a bounded scanline calculation before any grid is
allocated. Polar coordinates use a finite geographic fallback. Neither
calculation changes the original geometry. Consumers cache results with the
content revision, so visibility changes and camera movement do no geometry work.

`LandmarkIcon`, `LANDMARK_ICON_OPTIONS`, and `isLandmarkIcon` define the five
supported wire values. `normalizeLandmarkIcon` is a display fallback for missing
cached properties, not an API-input validator. In particular, old queued edits
with no icon represent unknown/unmodified intent and must not be normalized to
an explicit DEFAULT mutation. Collection grouping preserves the normalized icon.
Artwork, colorization, image registration and label layers belong to map-viewer;
caches, offline operations and forms belong to each application.

Focused tests cover Unicode limits, concave/thin polygons, complete-path
midpoints, repeated vertices, polar/tiny coordinates, immutability and icon
preservation through cached collection grouping.
