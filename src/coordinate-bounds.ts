/** Camera-ready corners; east may exceed 180 to retain a short wrapped span. */
export type CoordinateBounds = [[number, number], [number, number]];

/** Decode finite GeoJSON bbox axes. The caller decides whether to trust metadata. */
export function decodeGeoJSONBBox(bbox: unknown): CoordinateBounds | null {
  if (
    !Array.isArray(bbox) ||
    bbox.length < 4 ||
    bbox.length % 2 ||
    !bbox.every(Number.isFinite)
  )
    return null;
  const dimensions = bbox.length / 2;
  const west: number = bbox[0];
  const east: number =
    bbox[dimensions] < west ? bbox[dimensions] + 360 : bbox[dimensions];
  return [
    [west, bbox[1]],
    [east, bbox[dimensions + 1]],
  ];
}

export interface CoordinateBoundsAccumulator {
  readonly bbox: CoordinateBounds | null;
  extend(this: void, position: readonly number[]): void;
  finishSteps(): Generator<void, CoordinateBounds | null, unknown>;
  finish(): CoordinateBounds | null;
}

/** Bottom-up merge sort avoids a single uninterruptible Array.sort call. */
function* sortLongitudes(
  values: readonly number[],
): Generator<void, number[], unknown> {
  // A cancelled sort must not leave the accumulator partially overwritten.
  // Copy cooperatively as well, so one very large geometry stays interruptible.
  let sorted: number[] = [];
  for (const value of values) {
    sorted.push(value);
    yield;
  }
  let scratch = new Array<number>(values.length);
  for (let width = 1; width < values.length; width *= 2) {
    for (let start = 0; start < values.length; start += width * 2) {
      const middle = Math.min(start + width, values.length);
      const end = Math.min(start + width * 2, values.length);
      let left = start;
      let right = middle;
      for (let out = start; out < end; out += 1) {
        scratch[out] =
          left < middle && (right >= end || sorted[left]! <= sorted[right]!)
            ? sorted[left++]!
            : sorted[right++]!;
        yield;
      }
    }
    [sorted, scratch] = [scratch, sorted];
  }
  return sorted;
}

/**
 * Accumulate finite positions for camera fitting, skipping unusable coordinates.
 * Wrapped mode accepts arbitrary finite longitudes and keeps the first largest
 * sorted gap on ties. Strict validation and directed-arc coverage are separate
 * contracts in geographic-bounds; this does not replace them.
 */
export function createCoordinateBounds({
  wrapLongitude = true,
  bbox = null,
}: {
  wrapLongitude?: boolean;
  bbox?: CoordinateBounds | null;
} = {}): CoordinateBoundsAccumulator {
  const longitudes: number[] = [];
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;

  function extend(coordinates: readonly number[]) {
    if (bbox) return;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
    if (wrapLongitude) longitudes.push(((longitude! % 360) + 360) % 360);
    else {
      west = Math.min(west, longitude!);
      east = Math.max(east, longitude!);
    }
    south = Math.min(south, latitude!);
    north = Math.max(north, latitude!);
  }

  function* finishSteps(): Generator<void, CoordinateBounds | null, unknown> {
    if (bbox) return bbox;
    if (!Number.isFinite(south)) return null;
    if (!wrapLongitude)
      return [
        [west, south],
        [east, north],
      ];
    const sorted = yield* sortLongitudes(longitudes);
    let largestGap = -Infinity;
    let gapIndex = 0;
    for (let index = 0; index < sorted.length; index += 1) {
      const next =
        index === sorted.length - 1 ? sorted[0]! + 360 : sorted[index + 1]!;
      const gap = next - sorted[index]!;
      if (gap > largestGap) {
        largestGap = gap;
        gapIndex = index;
      }
      yield;
    }
    let wrappedWest = sorted[(gapIndex + 1) % sorted.length]!;
    let wrappedEast = sorted[gapIndex]!;
    if (wrappedEast < wrappedWest) wrappedEast += 360;
    if (wrappedWest > 180) {
      wrappedWest -= 360;
      wrappedEast -= 360;
    }
    return [
      [wrappedWest, south],
      [wrappedEast, north],
    ];
  }

  return {
    bbox,
    extend,
    finishSteps,
    finish() {
      const steps = finishSteps();
      let step = steps.next();
      while (!step.done) step = steps.next();
      return step.value;
    },
  };
}
