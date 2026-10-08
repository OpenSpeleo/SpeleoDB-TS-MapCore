import type { Geometry, Position } from "geojson";

export interface GeometryPreparationPolicy {
  visitPosition?: (position: Position) => void;
  flattenAltitude?: boolean;
}

// Yield for containers as well as positions: even many empty rings/collections
// must not hide unbounded traversal between two scheduling checkpoints.
function* coordinateSteps(coordinates: unknown): Generator<Position | null> {
  if (!Array.isArray(coordinates)) {
    yield null;
    return;
  }
  if (typeof coordinates[0] === "number") {
    yield coordinates as Position;
    return;
  }
  yield null;
  for (const child of coordinates) yield* coordinateSteps(child);
}

/** Traverse positions without flattening topology or copying source data. */
export function* geometryPositionSteps(
  geometry: Geometry | null | undefined,
): Generator<Position | null> {
  yield null;
  if (!geometry) return;
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries || [])
      yield* geometryPositionSteps(child);
  } else {
    yield* coordinateSteps(geometry.coordinates);
  }
}

function* prepareCoordinates<Coordinates>(
  coordinates: Coordinates,
  policy: GeometryPreparationPolicy,
): Generator<void, Coordinates, unknown> {
  if (!Array.isArray(coordinates) || !coordinates.length) {
    yield;
    return coordinates;
  }
  if (typeof coordinates[0] === "number") {
    policy.visitPosition?.(coordinates as Position);
    yield;
    return (
      policy.flattenAltitude && coordinates.length >= 3
        ? [coordinates[0], coordinates[1], 0]
        : coordinates
    ) as Coordinates;
  }
  const output: unknown[] = policy.flattenAltitude ? [] : coordinates;
  for (const child of coordinates as unknown[]) {
    const prepared = yield* prepareCoordinates(child, policy);
    if (policy.flattenAltitude) output.push(prepared);
    yield;
  }
  return output as Coordinates;
}

/** Immutable geometry preparation; callers choose altitude and position policies. */
export function* transformGeometrySteps<G extends Geometry | null | undefined>(
  geometry: G,
  policy: GeometryPreparationPolicy,
): Generator<void, G, unknown> {
  if (!geometry) {
    yield;
    return geometry;
  }
  if (geometry.type === "GeometryCollection") {
    const geometries: Geometry[] = [];
    for (const child of geometry.geometries || []) {
      const prepared = yield* transformGeometrySteps(child, policy);
      if (policy.flattenAltitude) geometries.push(prepared);
      yield;
    }
    yield;
    return policy.flattenAltitude ? { ...geometry, geometries } : geometry;
  }
  const coordinates = yield* prepareCoordinates(geometry.coordinates, policy);
  return policy.flattenAltitude ? { ...geometry, coordinates } : geometry;
}

export interface PreparationOptions {
  isCurrent?: () => boolean;
  yieldWork?: () => Promise<unknown>;
  budgetMs?: number;
}
export interface PreparationRunnerDefaults {
  budgetMs: number;
  yieldWork?: () => Promise<unknown>;
  now?: () => number;
  maxSteps?: number;
  initialYield?: boolean;
  onSlice?: (started: number) => void;
}

/** A scheduler instance owns its CPU allowance; applications own its lifetime. */
export function createPreparationRunner(defaults: PreparationRunnerDefaults) {
  // Parallel downloads can resume in the same task. They share a CPU allowance
  // instead of each starting another full slice before the browser gets a turn.
  let preparationSliceStarted: number | null = null;
  const now = defaults.now ?? (() => performance.now());
  const defaultYield =
    defaults.yieldWork ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  /** Run CPU work in bounded tasks, including within one large geometry. */
  return async function runPreparation<Result>(
    steps: Generator<void, Result, unknown>,
    {
      isCurrent = () => true,
      yieldWork = defaultYield,
      budgetMs = defaults.budgetMs,
    }: PreparationOptions = {},
  ): Promise<Result> {
    const assertCurrent = () => {
      if (!isCurrent()) {
        const error = new Error("Viewer preparation superseded");
        error.name = "AbortError";
        throw error;
      }
    };
    assertCurrent();
    if (defaults.initialYield !== false) await yieldWork();
    assertCurrent();
    let sliceStarted = now();
    if (
      preparationSliceStarted === null ||
      sliceStarted < preparationSliceStarted
    )
      preparationSliceStarted = sliceStarted;
    let count = 0;
    for (;;) {
      const step = steps.next();
      if (step.done) {
        defaults.onSlice?.(sliceStarted);
        assertCurrent();
        return step.value;
      }
      count += 1;
      if (
        count >= (defaults.maxSteps ?? Infinity) ||
        now() - preparationSliceStarted >= budgetMs
      ) {
        assertCurrent();
        defaults.onSlice?.(sliceStarted);
        await yieldWork();
        assertCurrent();
        count = 0;
        sliceStarted = now();
        preparationSliceStarted = sliceStarted;
      }
    }
  };
}
