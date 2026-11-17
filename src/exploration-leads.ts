import type { FeatureCollection, Polygon, Position } from "geojson";

export const EXPLORATION_LEAD_MAX_HEADINGS = 3;
export const EXPLORATION_LEAD_CONE_LENGTH_METERS = 15;
export const EXPLORATION_LEAD_CONE_WIDTH_DEGREES = 45;
const EARTH_RADIUS_METERS = 6_371_000;
const ARC_SEGMENTS = 12;
const RADIANS = Math.PI / 180;

export interface ExplorationLeadDirection {
  heading: number | null;
  checked: boolean;
}

/** An undirected lead remains checkable and never counts as an empty group. */
export function createDefaultExplorationLeadDirections(): ExplorationLeadDirection[] {
  return [{ heading: null, checked: false }];
}

/** Reject incomplete records instead of silently dropping a lead or its status. */
export function parseExplorationLeadDirections(
  value: unknown,
): ExplorationLeadDirection[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > EXPLORATION_LEAD_MAX_HEADINGS
  )
    return null;
  const directions: ExplorationLeadDirection[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      return null;
    const { heading, checked } = entry as Record<string, unknown>;
    if (
      typeof checked !== "boolean" ||
      (heading !== null &&
        (typeof heading !== "number" ||
          !Number.isFinite(heading) ||
          heading < 0 ||
          heading >= 360))
    )
      return null;
    directions.push({ heading, checked });
  }
  return directions;
}

export function isExplorationLeadFullyChecked(
  directions: readonly ExplorationLeadDirection[],
): boolean {
  return directions.length > 0 && directions.every((entry) => entry.checked);
}

/** Derive ground-scale cones without changing the application's point source. */
export function buildExplorationLeadCones(
  data: FeatureCollection,
): FeatureCollection<Polygon> {
  const features: FeatureCollection<Polygon>["features"] = [];
  for (const feature of data.features) {
    if (feature.geometry.type !== "Point") continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (
      longitude === undefined ||
      latitude === undefined ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      continue;
    const origin: Position = [longitude, latitude];
    const directions = parseExplorationLeadDirections(
      feature.properties?.directions,
    );
    if (!directions) continue;
    for (const [index, { heading, checked }] of directions.entries()) {
      if (checked || heading === null) continue;
      const ring: Position[] = [origin];
      for (let segment = 0; segment <= ARC_SEGMENTS; segment++) {
        const bearing =
          (heading -
            EXPLORATION_LEAD_CONE_WIDTH_DEGREES / 2 +
            (segment * EXPLORATION_LEAD_CONE_WIDTH_DEGREES) / ARC_SEGMENTS) *
          RADIANS;
        const distance =
          EXPLORATION_LEAD_CONE_LENGTH_METERS / EARTH_RADIUS_METERS;
        const lat = latitude * RADIANS;
        const targetLat = Math.asin(
          Math.sin(lat) * Math.cos(distance) +
            Math.cos(lat) * Math.sin(distance) * Math.cos(bearing),
        );
        const longitudeDelta = Math.atan2(
          Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
          Math.cos(distance) - Math.sin(lat) * Math.sin(targetLat),
        );
        // Retain the local longitude branch across the antimeridian.
        ring.push([longitude + longitudeDelta / RADIANS, targetLat / RADIANS]);
      }
      ring.push([...origin]);
      features.push({
        type: "Feature",
        ...(feature.id === undefined
          ? {}
          : { id: `${feature.id}:heading:${index}` }),
        properties: feature.properties,
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
