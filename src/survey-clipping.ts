import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Position,
} from "geojson";
import { GIS_GEOMETRY_CONTRACT, validateGeometry } from "./geometry.js";

type SurveyFeature = Feature<Point | LineString>;
type XY = [number, number];
type Bounds = [number, number, number, number];
const PARAMETER_EPSILON = 1e-12;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function position(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    value.every(
      (item: unknown) => typeof item === "number" && Number.isFinite(item),
    ) &&
    Math.abs(value[0] as number) <= 180 &&
    Math.abs(value[1] as number) <= 90
  );
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function crossTolerance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return 16 * Number.EPSILON * (Math.abs(ax * by) + Math.abs(ay * bx));
}

function inside(point: Position, ring: XY[], bounds: Bounds): boolean {
  const [x, y] = point as XY;
  if (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3])
    return false;
  let contained = false;
  for (let index = 1; index < ring.length; index += 1) {
    const a = ring[index - 1]!;
    const b = ring[index]!;
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const px = x - a[0],
      py = y - a[1];
    if (
      Math.abs(cross(dx, dy, px, py)) <= crossTolerance(dx, dy, px, py) &&
      x >= Math.min(a[0], b[0]) &&
      x <= Math.max(a[0], b[0]) &&
      y >= Math.min(a[1], b[1]) &&
      y <= Math.max(a[1], b[1])
    )
      return true;
    if (a[1] > y !== b[1] > y && x < a[0] + ((y - a[1]) * dx) / dy)
      contained = !contained;
  }
  return contained;
}

function interpolate(a: Position, b: Position, t: number): Position {
  if (t === 0) return [...a];
  if (t === 1) return [...b];
  return a.map((value, index) => value + t * (b[index]! - value));
}

function same(a: Position, b: Position): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Each interval is bounded by polygon crossings; its midpoint decides inclusion. */
function segmentIntervals(
  a: Position,
  b: Position,
  ring: XY[],
  bounds: Bounds,
): number[][] {
  const ax = a[0]!,
    ay = a[1]!;
  const dx = b[0]! - ax,
    dy = b[1]! - ay;
  // A vertical survey shaft has no horizontal extent but retains meaningful
  // elevation/depth. Exact duplicate positions contribute no segment.
  if (dx === 0 && dy === 0)
    return !same(a, b) && inside(a, ring, bounds) ? [[0, 1]] : [];
  if (
    Math.max(ax, b[0]!) < bounds[0] ||
    Math.min(ax, b[0]!) > bounds[2] ||
    Math.max(ay, b[1]!) < bounds[1] ||
    Math.min(ay, b[1]!) > bounds[3]
  )
    return [];
  const cuts = [0, 1];
  const add = (t: number) => {
    if (t >= -PARAMETER_EPSILON && t <= 1 + PARAMETER_EPSILON)
      cuts.push(Math.max(0, Math.min(1, t)));
  };
  for (let index = 1; index < ring.length; index += 1) {
    const c = ring[index - 1]!,
      d = ring[index]!;
    const ex = d[0] - c[0],
      ey = d[1] - c[1];
    const qx = c[0] - ax,
      qy = c[1] - ay;
    const denominator = cross(dx, dy, ex, ey);
    if (Math.abs(denominator) > crossTolerance(dx, dy, ex, ey)) {
      const u = cross(qx, qy, dx, dy) / denominator;
      if (u >= -PARAMETER_EPSILON && u <= 1 + PARAMETER_EPSILON)
        add(cross(qx, qy, ex, ey) / denominator);
    } else if (
      Math.abs(cross(qx, qy, dx, dy)) <= crossTolerance(qx, qy, dx, dy)
    ) {
      // Collinear overlap: include the entire retained boundary segment.
      if (Math.abs(dx) >= Math.abs(dy)) {
        add(qx / dx);
        add((d[0] - ax) / dx);
      } else {
        add(qy / dy);
        add((d[1] - ay) / dy);
      }
    }
  }
  cuts.sort((left, right) => left - right);
  const unique = cuts.filter(
    (t, index) => index === 0 || t - cuts[index - 1]! > PARAMETER_EPSILON,
  );
  const intervals: number[][] = [];
  for (let index = 1; index < unique.length; index += 1) {
    const start = unique[index - 1]!,
      end = unique[index]!;
    if (inside(interpolate(a, b, (start + end) / 2), ring, bounds)) {
      const previous = intervals.at(-1);
      if (previous && previous[1] === start) previous[1] = end;
      else intervals.push([start, end]);
    }
  }
  return intervals;
}

function* clipLine(
  coordinates: unknown,
  ring: XY[],
  bounds: Bounds,
): Generator<void, Position[][], unknown> {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  const fragments: Position[][] = [];
  let current: Position[] | undefined;
  let previous: Position | undefined;
  for (const candidate of coordinates as unknown[]) {
    yield;
    if (
      !position(candidate) ||
      (previous &&
        (candidate.length !== previous.length ||
          Math.abs(candidate[0]! - previous[0]!) > 180))
    )
      return [];
    if (previous) {
      const intervals = segmentIntervals(previous, candidate, ring, bounds);
      for (const [start, end] of intervals) {
        const first = interpolate(previous, candidate, start!);
        const last = interpolate(previous, candidate, end!);
        if (current && same(current.at(-1)!, first)) current.push(last);
        else {
          current = [first, last];
          fragments.push(current);
        }
        if (end !== 1) current = undefined;
      }
      if (!intervals.length && !same(previous, candidate)) current = undefined;
    }
    previous = candidate;
  }
  return fragments;
}

/**
 * Opt-in visual clipping for survey points and lines. This does not protect
 * downloaded source data. Invalid bounds throw; unsupported/malformed source
 * geometries are excluded. Consume with a preparation runner for cancellation.
 */
export function* clipSurveyGeoJSONSteps(
  data: unknown,
  bound: unknown,
): Generator<void, FeatureCollection<Point | LineString>, unknown> {
  if (
    !record(bound) ||
    bound.type !== "Polygon" ||
    !Array.isArray(bound.coordinates) ||
    !Array.isArray(bound.coordinates[0]) ||
    bound.coordinates[0].length > GIS_GEOMETRY_CONTRACT.max_vertices + 1
  )
    throw new Error("Geographic bound must be a valid GIS Polygon.");
  const validation = validateGeometry(bound);
  if (!validation.valid || !validation.bounds)
    throw new Error(`Invalid geographic bound: ${validation.error}`);
  const ring = bound.coordinates[0] as XY[];
  const [[west, south], [east, north]] = validation.bounds;
  const bounds: Bounds = [west, south, east, north];
  const features: SurveyFeature[] = [];
  const sources: unknown[] =
    record(data) && data.type === "FeatureCollection"
      ? Array.isArray(data.features)
        ? data.features
        : []
      : [data];
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    yield;
    const source = sources[sourceIndex];
    if (!record(source)) continue;
    const isFeature = source.type === "Feature";
    const geometry = isFeature ? source.geometry : source;
    if (!record(geometry)) continue;
    const properties = isFeature ? source.properties : null;
    if (properties !== null && !record(properties)) continue;
    const type = geometry.type;
    if (
      type !== "Point" &&
      type !== "MultiPoint" &&
      type !== "LineString" &&
      type !== "MultiLineString"
    )
      continue;
    const parts: unknown[] =
      type === "MultiPoint" || type === "MultiLineString"
        ? Array.isArray(geometry.coordinates)
          ? geometry.coordinates
          : []
        : [geometry.coordinates];
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      yield;
      const part = parts[partIndex];
      if (type === "Point" || type === "MultiPoint") {
        if (position(part) && inside(part, ring, bounds))
          features.push({
            type: "Feature",
            id: `bound:${sourceIndex}:${partIndex}:0`,
            properties,
            geometry: { type: "Point", coordinates: [...part] },
          });
      } else {
        const fragments = yield* clipLine(part, ring, bounds);
        for (
          let fragmentIndex = 0;
          fragmentIndex < fragments.length;
          fragmentIndex += 1
        ) {
          yield;
          features.push({
            type: "Feature",
            id: `bound:${sourceIndex}:${partIndex}:${fragmentIndex}`,
            properties,
            geometry: {
              type: "LineString",
              coordinates: fragments[fragmentIndex]!,
            },
          });
        }
      }
    }
  }
  return { type: "FeatureCollection", features };
}
