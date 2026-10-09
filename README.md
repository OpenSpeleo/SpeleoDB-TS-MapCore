# @speleodb/map-core

Renderer-independent map algorithms shared by SpeleoDB's web and mobile viewers.
This package has no framework, browser, networking, persistence or renderer
initialization. Applications retain their API clients, permissions, state and
product policies.

## APIs and ownership

| Import                                 | Responsibility                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@speleodb/map-core/geometry`          | Bounded LineString/Polygon validation, topology, spherical bounding-box area and vertex measurement |
| `@speleodb/map-core/geographic-bounds` | Directed longitude intervals, dateline normalization and Web Mercator footprints                    |
| `@speleodb/map-core/geo`               | Spherical distance with an explicit Earth-radius parameter                                          |
| `@speleodb/map-core/depth`             | Depth domains, limits, unit conversion and configurable depth processing                            |
| `@speleodb/map-core/landmarks`         | Collection grouping with application-owned metadata and ordering policies                           |
| `@speleodb/map-core/visibility`        | Effective country, individual and readiness gating without owning preferences                       |
| `@speleodb/map-core/colors`            | Validation of model-provided RGB hex colors                                                         |
| `@speleodb/map-core/preparation`       | Cooperative immutable geometry traversal with per-position and per-container checkpoints            |

GeoJSON is input data, not renderer state. Traversal preserves source identity
when no transformation is requested. Altitude flattening is an explicit policy:
web uses it for overlays, while mobile preserves altitude for depth and offline
workflows. Generators let the application schedule and cancel work within a
single large geometry. Empty collections also produce checkpoints.

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

The repository is an npm-format private package, distributed through a public
[GitHub repository](https://github.com/OpenSpeleo/SpeleoDB-TS-MapCore) pinned to
a full commit SHA. It is not published on npm. Package exports point directly to
`src/*.ts`, including type exports. Bun can execute these sources, and consuming
applications compile them with their normal Vite build. Source and JSON assets
travel together; no dependency installation build hook is required.

Run `bun run typecheck` and `bun run test` to check types and behavior.
`bun run build` smoke-tests browser compilation with Bun and writes disposable
output to ignored `dist/`. That output is not part of the package or committed.
CI validates source, tests, compilation and package contents.

Monorepo consumers link the live local checkout before dependency resolution;
standalone consumers compile sources from their pinned Git revision. Older pins
can select their `speleodb-source` condition until updated to default source
exports. See the monorepo's TypeScript package documentation for dependency
overlays and the release handoff.

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
