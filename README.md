# @speleodb/map-core

Renderer-independent map algorithms shared by SpeleoDB's web and mobile viewers.
This package has no framework, browser, networking, persistence or renderer
initialization. Applications retain their API clients, permissions, state and
product policies.

## APIs and ownership

| Import                                 | Responsibility                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@speleodb/map-core/geometry`          | Bounded LineString/Polygon validation, topology, spherical bounding-box area and vertex measurement     |
| `@speleodb/map-core/geometry-labels`   | Unicode alias validation and stable interior/midpoint label features                                    |
| `@speleodb/map-core/geographic-bounds` | Directed longitude intervals, dateline normalization and Web Mercator footprints                        |
| `@speleodb/map-core/geo`               | Spherical distance with an explicit Earth-radius parameter                                              |
| `@speleodb/map-core/depth`             | Depth domains, limits, unit conversion and configurable depth processing                                |
| `@speleodb/map-core/landmarks`         | Collection grouping with application-owned metadata and ordering policies                               |
| `@speleodb/map-core/landmark-icons`    | Landmark icon wire values, choice labels, validation and display defaults                               |
| `@speleodb/map-core/visibility`        | Effective country, individual and readiness gating without owning preferences                           |
| `@speleodb/map-core/colors`            | Validation of model-provided RGB hex colors                                                             |
| `@speleodb/map-core/preparation`       | Cooperative immutable geometry traversal with per-position and per-container checkpoints                |
| `@speleodb/map-core/coordinate-bounds` | Camera coordinate accumulation, bbox decoding and interruptible longitude sorting                       |
| `@speleodb/map-core/geojson-transport` | Bounded JSON-tree messages and safe reconstruction without worker ownership                             |
| `@speleodb/map-core/nearest`           | Stable nearest geographic candidate selection with caller-owned eligibility and radius                  |
| `@speleodb/map-core/survey-clipping`   | Opt-in polygon clipping of survey points and lines, with cooperative scheduling and preserved elevation |

GeoJSON is input data, not renderer state. Traversal preserves source identity
when no transformation is requested. Altitude flattening is an explicit policy:
web uses it for overlays, while mobile preserves altitude for depth and offline
workflows. Generators let the application schedule and cancel work within a
single large geometry. Empty collections also produce checkpoints.

See [coordinate bounds](docs/coordinate-bounds.md) for the distinction between
permissive camera fitting and strict directed-arc validation, and
[data transport and selection](docs/data-transport-and-selection.md) for bounded
worker messages and nearest-candidate contracts. Transport has an explicit
subpath because most consumers do not need its wire types.

See [survey clipping](docs/survey-clipping.md) for the public web viewer's
opt-in display restriction. It clips crossing lines and includes boundary
points; it does not restrict access to downloaded data or change other viewers.

Longitude intervals describe the entire eastward arc, not just two endpoints.
Merging intervals preserves their coverage, including full-world intervals. GIS
validation deliberately rejects antimeridian-crossing editable geometry; this is
a different contract from fitting arbitrary survey data.

Depth parsing policies differ between consumers. Numeric aliases, units, section
fallbacks and color ramps must be supplied or retained by the application;
sharing arithmetic must not silently change stored-data interpretation. Model
colors remain server-driven; this package contains no project color palette.

## Geometry contract

`geometry-contract.json` and `geometry-cases.json` snapshot the server's
canonical contract and fixture corpus. The web integration checks both against
the Python copies. Change the canonical server policy and these snapshots
together. Limits are enforced before the polygon intersection check, bounding
its quadratic work to 100 vertices. Area means spherical bounding-box area,
including for lines.

## Development and distribution

Install dependencies with the pinned Bun version using
`bun install --frozen-lockfile` in a standalone clone, or
`bun run install:local` from the monorepo root. Run `prek run -a` from this
package for file hygiene, Prettier, ESLint, CI configuration checks, TypeScript
checks, standalone lockfile verification, browser compilation and unit tests. No
Git hook installation is needed; review formatting fixes and rerun the checks.

Use `bun run lint`, `bun run format:check`, and `bun run check:lockfile` for
individual checks, or `bun run lint:fix` and `bun run format` to apply fixes.
Lock verification runs in a temporary standalone directory so the parent
workspace cannot hide stale dependencies. CI also checks linting and formatting.

The package is published publicly on npm as `@speleodb/map-core` from its
[GitHub repository](https://github.com/OpenSpeleo/SpeleoDB-TS-MapCore). Package
exports point directly to `src/*.ts`, including type exports. Bun can execute
these sources, and consuming applications compile them with their normal Vite
build. Source and JSON assets travel together; no dependency installation build
hook is required.

Run `bun run typecheck` and `bun run test` to check types and behavior.
`bun run test` runs the configured Vitest suite used by CI; `bun test` selects
Bun's separate built-in test runner. CI runs both commands to verify the
complete library suite with both runners. `bun run build` smoke-tests browser
compilation with Bun and writes disposable output to ignored `dist/`. That
output is not part of the package or committed. CI validates source, tests,
compilation and package contents.

Monorepo consumers link the live local checkout before dependency resolution;
standalone consumers compile sources from their pinned npm version. Older Git
pins can select their `speleodb-source` condition until updated to default
source exports. See the monorepo's TypeScript package documentation for
dependency overlays and the release handoff.

## npm releases

Version **0.4.0** adds the opt-in `clipSurveyGeoJSONSteps` generator, exported
from the package root and `@speleodb/map-core/survey-clipping`. It clips survey
points and lines to a Polygon while preserving elevation and supporting
cooperative scheduling. Existing callers retain their behavior unless they
explicitly apply clipping. See [survey clipping](docs/survey-clipping.md) for
the input contract and display-only scope.

A pushed `v<package.json version>` tag runs the full CI verification and then
builds and publishes the package with npm trusted publishing. The publish job
requires the tag to match the package version. Configure `@speleodb/map-core` on
npmjs.com with a GitHub Actions trusted publisher for organization `OpenSpeleo`,
repository `SpeleoDB-TS-MapCore`, workflow filename `ci.yml`, environment name
`publish`, label `github`, and permission to run `npm publish`. The job uses
GitHub OIDC; no npm write token is needed.

## Locking inside the monorepo

Run `bun run lock` here to resolve only this package's standalone `bun.lock`.
Use `bun run lock --upgrade` to refresh direct and transitive resolutions within
the existing manifest constraints. Both delegate to the monorepo's shared
`utilities/bun-lock/lock.mjs`, using external temporary staging without
installing dependencies or running lifecycle scripts. Only the child lock is
published after success; refresh the root integration lock separately.

This convenience command requires the monorepo. In a standalone clone, use
`bun install --lockfile-only --ignore-scripts`. Existing standalone lock checks,
builds and CI remain independent of the shared utility.
