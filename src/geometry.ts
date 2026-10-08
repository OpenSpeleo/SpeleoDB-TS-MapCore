import contract from "./geometry-contract.json" with { type: "json" };

/** Snapshot of the server's authoritative GIS geometry contract. */
export const GIS_GEOMETRY_CONTRACT = Object.freeze(contract);
const RULES = GIS_GEOMETRY_CONTRACT;
export type Position2D = [number, number];
export interface GeometryMeasurement {
  areaM2: number;
  areaKm2: number;
  vertexCount: number;
  bounds: [Position2D, Position2D] | null;
}
export interface GeometryValidation extends GeometryMeasurement {
  valid: boolean;
  error: string;
}

/** Property reads precede validation in the original parser; assertions preserve that order. */
interface GeometryCandidate {
  type?: string;
  coordinates?: unknown[] | null;
}

const TYPES = new Set(RULES.types);

function equalCoordinates(first: Position2D, second: Position2D) {
  return first[0] === second[0] && first[1] === second[1];
}

function coordinatesOf(geometry: unknown): unknown {
  if ((geometry as GeometryCandidate | null | undefined)?.type === "LineString")
    return (geometry as GeometryCandidate).coordinates;
  if ((geometry as GeometryCandidate | null | undefined)?.type === "Polygon")
    return (geometry as GeometryCandidate).coordinates?.[0];
  return [];
}

function validCoordinate(coordinate: unknown): coordinate is Position2D {
  return (
    Array.isArray(coordinate) &&
    coordinate.length === RULES.position_dimensions &&
    coordinate.every(
      (value: unknown) => typeof value === "number" && Number.isFinite(value),
    ) &&
    (coordinate as Position2D)[0] >= -RULES.longitude_limit &&
    (coordinate as Position2D)[0] <= RULES.longitude_limit &&
    (coordinate as Position2D)[1] >= -RULES.latitude_limit &&
    (coordinate as Position2D)[1] <= RULES.latitude_limit
  );
}

/** Measures coordinates only; user-provided bbox and other metadata are never trusted. */
export function measureGeometry(geometry: unknown): GeometryMeasurement {
  const positions = coordinatesOf(geometry);
  const coordinates = Array.isArray(positions)
    ? (positions as unknown[]).filter(validCoordinate)
    : [];
  let vertexCount = coordinates.length;
  if (
    (geometry as GeometryCandidate | null | undefined)?.type === "Polygon" &&
    vertexCount > 1 &&
    equalCoordinates(coordinates[0]!, coordinates.at(-1)!)
  ) {
    vertexCount -= 1;
  }
  if (!coordinates.length)
    return { areaM2: 0, areaKm2: 0, vertexCount, bounds: null };
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  const radians = Math.PI / RULES.longitude_limit;
  const areaM2 =
    RULES.earth_radius_m ** 2 *
    ((east - west) * radians) *
    2 *
    Math.cos(((north + south) / 2) * radians) *
    Math.sin(((north - south) / 2) * radians);
  return {
    areaM2,
    areaKm2: areaM2 / RULES.square_metres_per_square_kilometre,
    vertexCount,
    bounds: [
      [west, south],
      [east, north],
    ],
  };
}

function cross(first: Position2D, second: Position2D, third: Position2D) {
  return (
    (second[0] - first[0]) * (third[1] - first[1]) -
    (second[1] - first[1]) * (third[0] - first[0])
  );
}

function contains(first: Position2D, second: Position2D, point: Position2D) {
  return (
    point[0] >= Math.min(first[0], second[0]) &&
    point[0] <= Math.max(first[0], second[0]) &&
    point[1] >= Math.min(first[1], second[1]) &&
    point[1] <= Math.max(first[1], second[1])
  );
}

function intersects(
  first: Position2D,
  second: Position2D,
  third: Position2D,
  fourth: Position2D,
) {
  const a = cross(first, second, third);
  const b = cross(first, second, fourth);
  const c = cross(third, fourth, first);
  const d = cross(third, fourth, second);
  if (
    ((a > 0 && b < 0) || (a < 0 && b > 0)) &&
    ((c > 0 && d < 0) || (c < 0 && d > 0))
  )
    return true;
  return (
    (a === 0 && contains(first, second, third)) ||
    (b === 0 && contains(first, second, fourth)) ||
    (c === 0 && contains(third, fourth, first)) ||
    (d === 0 && contains(third, fourth, second))
  );
}

function polygonError(coordinates: Position2D[]) {
  const vertices = coordinates.slice(0, -1);
  if (
    new Set(vertices.map((coordinate) => coordinate.join(","))).size !==
    vertices.length
  ) {
    return "Polygon vertices must be distinct. Remove the repeated point.";
  }
  // Translate before the area sum to avoid cancellation around large GPS coordinates.
  const origin = vertices[0]!;
  let twiceArea = 0;
  for (let index = 1; index < vertices.length - 1; index += 1) {
    twiceArea += cross(origin, vertices[index]!, vertices[index + 1]!);
  }
  if (twiceArea === 0)
    return "A polygon must enclose an area. Move or add a point.";
  for (let first = 0; first < vertices.length; first += 1) {
    const second = (first + 1) % vertices.length;
    for (let third = first + 1; third < vertices.length; third += 1) {
      const fourth = (third + 1) % vertices.length;
      if (first === third || second === third || fourth === first) continue;
      if (
        intersects(
          vertices[first]!,
          vertices[second]!,
          vertices[third]!,
          vertices[fourth]!,
        )
      ) {
        return "Polygon edges cannot cross or touch. Move the crossing points.";
      }
    }
  }
  // Adjacent edges may share a vertex, but may not double back over each other.
  for (let index = 0; index < vertices.length; index += 1) {
    const previous = vertices[(index + vertices.length - 1) % vertices.length]!;
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    const overlap =
      (previous[0] - current[0]) * (next[0] - current[0]) +
      (previous[1] - current[1]) * (next[1] - current[1]);
    if (cross(previous, current, next) === 0 && overlap > 0) {
      return "Polygon edges cannot overlap. Move or remove the overlapping point.";
    }
  }
  return "";
}

/** Shared by the map editor and Advanced GeoJSON form. Accepts one bare geometry. */
export function validateGeometry(geometry: unknown): GeometryValidation {
  const measured = measureGeometry(geometry);
  const invalid = (error: string) => ({ ...measured, valid: false, error });
  if (
    !geometry ||
    typeof geometry !== "object" ||
    Array.isArray(geometry) ||
    !TYPES.has((geometry as GeometryCandidate).type!)
  ) {
    return invalid("Use one GeoJSON LineString or Polygon geometry.");
  }
  if (
    Object.keys(geometry).some((key) => key !== "type" && key !== "coordinates")
  ) {
    return invalid(
      "A geometry accepts only type and coordinates; remove other fields.",
    );
  }
  if (
    (geometry as GeometryCandidate).type === "Polygon" &&
    (!Array.isArray((geometry as GeometryCandidate).coordinates) ||
      (geometry as GeometryCandidate).coordinates!.length !== 1)
  ) {
    return invalid("Polygons must have one outer ring and no holes.");
  }
  const coordinates = coordinatesOf(geometry) as Position2D[];
  if (
    !Array.isArray(coordinates) ||
    !(coordinates as unknown[]).every(validCoordinate)
  ) {
    return invalid(
      `Coordinates must be finite [longitude, latitude] pairs within −${RULES.longitude_limit}…${RULES.longitude_limit} and −${RULES.latitude_limit}…${RULES.latitude_limit}.`,
    );
  }
  if (
    (geometry as GeometryCandidate).type === "LineString" &&
    coordinates.length < RULES.min_line_vertices
  )
    return invalid("Add at least two points to create a line.");
  if (
    (geometry as GeometryCandidate).type === "Polygon" &&
    (coordinates.length < RULES.min_polygon_vertices + 1 ||
      !equalCoordinates(coordinates[0]!, coordinates.at(-1)!))
  ) {
    return invalid(
      "A polygon needs at least three points and a closed outer ring.",
    );
  }
  if (measured.vertexCount > RULES.max_vertices) {
    return invalid(
      `A geometry can contain at most ${RULES.max_vertices} vertices.`,
    );
  }
  for (let index = 1; index < coordinates.length; index += 1) {
    if (
      Math.abs(coordinates[index]![0] - coordinates[index - 1]![0]) >
      RULES.longitude_limit
    ) {
      return invalid(
        `Geometries crossing the antimeridian (±${RULES.longitude_limit}° longitude) are not supported.`,
      );
    }
    if (equalCoordinates(coordinates[index]!, coordinates[index - 1]!)) {
      return invalid("Consecutive points must have different coordinates.");
    }
  }
  if ((geometry as GeometryCandidate).type === "Polygon") {
    const error = polygonError(coordinates);
    if (error) return invalid(error);
  }
  if (measured.areaM2 > RULES.max_area_m2) {
    return invalid(
      `The bounding box exceeds ${RULES.max_area_m2 / RULES.square_metres_per_square_kilometre} km². Reduce its extent to keep the map responsive.`,
    );
  }
  return { ...measured, valid: true, error: "" };
}

export function geometryVertices(geometry: unknown): Position2D[] {
  const positions = coordinatesOf(geometry);
  if (!Array.isArray(positions)) return [];
  const vertices = (positions as unknown[])
    .filter(validCoordinate)
    .map((coordinate) => [...coordinate] as Position2D);
  if (
    (geometry as GeometryCandidate | null | undefined)?.type === "Polygon" &&
    vertices.length > 1 &&
    equalCoordinates(vertices[0]!, vertices.at(-1)!)
  )
    vertices.pop();
  return vertices;
}
