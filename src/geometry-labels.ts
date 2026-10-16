import type { Feature, LineString, Point, Polygon } from "geojson";
import polylabel from "polylabel";
import { WEB_MERCATOR_MAX_LATITUDE } from "./geographic-bounds.js";
import { GIS_GEOMETRY_CONTRACT, validateGeometry } from "./geometry.js";

type Position = [number, number];
const RADIANS = Math.PI / 180;
// Relative to the largest projected extent; independent of camera/zoom.
const LABEL_PRECISION = 0.001;

export interface GeometryLabelProperties {
  id: string;
  alias: string;
  color: string;
  geometry_type: "LineString" | "Polygon";
}

export function isGeometryAliasValid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Array.from(value).length <= GIS_GEOMETRY_CONTRACT.alias_max_length
  );
}

function lineMidpoint(points: readonly Position[]): Position {
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index]!;
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  });
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (!length) continue;
    if (remaining <= length) {
      const first = points[index]!;
      const next = points[index + 1]!;
      const fraction = remaining / length;
      return [
        first[0] + (next[0] - first[0]) * fraction,
        first[1] + (next[1] - first[1]) * fraction,
      ];
    }
    remaining -= length;
  }
  return [...points[0]!];
}

function isInterior(point: Position, ring: readonly Position[]): boolean {
  let inside = false;
  for (let index = 1; index < ring.length; index++) {
    const [ax, ay] = ring[index - 1]!;
    const [bx, by] = ring[index]!;
    const cross = (point[0] - ax) * (by - ay) - (point[1] - ay) * (bx - ax);
    if (
      cross === 0 &&
      point[0] >= Math.min(ax, bx) &&
      point[0] <= Math.max(ax, bx) &&
      point[1] >= Math.min(ay, by) &&
      point[1] <= Math.max(ay, by)
    )
      return false;
    if (
      ay > point[1] !== by > point[1] &&
      point[0] < ax + ((point[1] - ay) * (bx - ax)) / (by - ay)
    )
      inside = !inside;
  }
  return inside;
}

/** Bounded fallback, including very thin polygons whose polylabel grid is huge. */
function scanlineInterior(
  ring: readonly Position[],
  width: number,
  height: number,
): Position | null {
  const along = width >= height ? 0 : 1;
  const across = along === 0 ? 1 : 0;
  const level = (across === 0 ? width : height) / 2;
  const intersections: number[] = [];
  for (let index = 1; index < ring.length; index++) {
    const a = ring[index - 1]!;
    const b = ring[index]!;
    if (a[across] > level === b[across] > level) continue;
    intersections.push(
      a[along] +
        ((level - a[across]) * (b[along] - a[along])) / (b[across] - a[across]),
    );
  }
  intersections.sort((a, b) => a - b);
  let longest = 0;
  let result: Position | null = null;
  for (let index = 1; index < intersections.length; index += 2) {
    const start = intersections[index - 1]!;
    const end = intersections[index]!;
    if (end - start <= longest) continue;
    const midpoint = (start + end) / 2;
    const candidate: Position =
      along === 0 ? [midpoint, level] : [level, midpoint];
    if (isInterior(candidate, ring)) {
      longest = end - start;
      result = candidate;
    }
  }
  return result;
}

function polygonAnchor(points: readonly Position[]): Position | null {
  const west = Math.min(...points.map(([x]) => x));
  const south = Math.min(...points.map(([, y]) => y));
  const width = Math.max(...points.map(([x]) => x)) - west;
  const height = Math.max(...points.map(([, y]) => y)) - south;
  const scale = Math.max(width, height);
  if (!scale || !width || !height) return null;
  const ring: Position[] = points.map(([x, y]) => [
    (x - west) / scale,
    (y - south) / scale,
  ]);
  let anchor: Position | null = null;
  if (Math.min(width, height) / scale >= LABEL_PRECISION) {
    const result = polylabel([ring], LABEL_PRECISION);
    const candidate: Position = [result[0], result[1]];
    if (result.distance > 0 && isInterior(candidate, ring)) anchor = candidate;
  }
  anchor ??= scanlineInterior(ring, width / scale, height / scale);
  return anchor ? [west + anchor[0] * scale, south + anchor[1] * scale] : null;
}

/** One stable, derived label point; callers cache it with the content revision. */
export function createGeometryLabelFeature({
  id,
  alias,
  color,
  geometry,
}: {
  id: string;
  alias: string;
  color: string;
  geometry: LineString | Polygon;
}): Feature<Point, GeometryLabelProperties> | null {
  if (
    !isGeometryAliasValid(alias) ||
    !alias.trim() ||
    !validateGeometry(geometry).valid
  )
    return null;
  const coordinates =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]!
      : geometry.coordinates;
  // Polar geometries retain their finite geographic positions, never clamped edits.
  const mercator = coordinates.every(
    (position) => Math.abs(position[1]!) <= WEB_MERCATOR_MAX_LATITUDE,
  );
  const projected: Position[] = coordinates.map((position) =>
    mercator
      ? [position[0]! * RADIANS, Math.asinh(Math.tan(position[1]! * RADIANS))]
      : [position[0]!, position[1]!],
  );
  const anchor =
    geometry.type === "Polygon"
      ? polygonAnchor(projected)
      : lineMidpoint(projected);
  if (!anchor) return null;
  const point: Position = mercator
    ? [anchor[0] / RADIANS, Math.atan(Math.sinh(anchor[1])) / RADIANS]
    : anchor;
  return {
    type: "Feature",
    id,
    properties: { id, alias, color, geometry_type: geometry.type },
    geometry: { type: "Point", coordinates: point },
  };
}
