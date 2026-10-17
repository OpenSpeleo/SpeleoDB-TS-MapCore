# Bounded JSON transport and nearest-point selection

## JSON tree transport

`@speleodb/map-core/geojson-transport` exports
`geoJSONMessages(buffer, batchSize)` and `applyGeoJSONNodes(containers, nodes)`
with portable JSON and message types. They move the parsed JSON tree in bounded
node batches while preserving its original shape and metadata. The mechanism is
independent of Worker construction, network requests, application state and
renderer ingestion.

The generator decodes and parses the input buffer on its first iteration. JSON
parse errors remain parse errors; the application decides which error details
may be shown. A positive integer batch size bounds the number of nodes in each
`nodes` message. Primitive roots use one `result` message. Container roots use
`start`, zero or more `nodes` messages, and `complete`. The traversal uses an
explicit iterator stack, so a single large coordinate array is split just like a
large feature collection. Numeric arrays of up to four elements can travel as a
single small leaf. Batching bounds tree traversal/structured-clone node counts;
it does not bound arbitrary string sizes or move JSON parsing off-thread by
itself.

The receiver creates root container ID `0` from the `start` message, then
applies each node batch to the same container registry. Container and leaf
message shapes form a trusted producer/consumer protocol; the receiver is not a
schema validator for arbitrary external messages. Root and child container
identity is preserved while batches arrive. `__proto__` is created as an own
data property without invoking prototype setters. Ordinary keys, arrays, empty
containers and all metadata round-trip unchanged.

The web application runs the generator in its module worker and acknowledges
each batch only after yielding. It retains worker lifecycle, input buffer
transfer, cancellation checks, parse threshold, error sanitization and the
`parse`/`next` control messages. Mobile's existing geometry-validation worker
has a different responsibility and is not replaced by this transport.

Package tests cover primitive roots, nested and empty containers, position
leaves, metadata and prototype preservation, invalid batch sizes and parse-error
ordering. A 100,000-position LineString verifies that one huge geometry produces
bounded messages and round-trips exactly. App tests retain worker creation,
handshake, termination, cancellation and safe user-facing errors.

## Nearest geographic candidate

`findNearestGeographicCandidate(origin, candidates, distanceInMeters?)` from
`@speleodb/map-core/nearest` accepts an iterable of objects with `coordinates`
and returns the original closest object plus its measured distance. It uses
shared spherical distance by default; callers may supply their configured
distance function. Candidate metadata and coordinates are never copied or
changed. Nonfinite or negative distance results are ignored: a distance policy
must produce a usable nonnegative number before a candidate can be selected.

Strict distance comparison keeps the first candidate on ties. An exact zero
stops iteration immediately, including closing an input generator. Empty input
or distances that never beat positive infinity produce `candidate: null` and
`distance: Infinity`. The function preserves the distance even when it lies
outside an application's snapping radius. Eligibility, visibility, project
ownership, tolerance/radius and return-record formatting belong to callers.

Web supplies each visible project's existing endpoint array. One web adapter
keeps project filtering, first-project ties and zero-distance early exit without
allocating new candidate objects per point. Its two public snapping operations
retain their different unsnapped result shapes and radius policies. Package
tests cover candidate identity, stable ties, lazy early exit, unusable
positions, NaN/infinite distances, antimeridian distance and caller distance
policy.
