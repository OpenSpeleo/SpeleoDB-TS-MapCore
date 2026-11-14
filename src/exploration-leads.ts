import type { FeatureCollection, Polygon, Position } from "geojson";

export const EXPLORATION_LEAD_MAX_HEADINGS = 3;
export const EXPLORATION_LEAD_CONE_LENGTH_METERS = 15;
export const EXPLORATION_LEAD_CONE_WIDTH_DEGREES = 45;
const EARTH_RADIUS_METERS = 6_371_000;
const ARC_SEGMENTS = 12;
const RADIANS = Math.PI / 180;

/** Missing headings in previously cached overlays mean no saved direction. */
export function explorationLeadHeadings(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (heading): heading is number =>
        typeof heading === "number" &&
        Number.isFinite(heading) &&
        heading >= 0 &&
        heading < 360,
    )
    .slice(0, EXPLORATION_LEAD_MAX_HEADINGS);
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
    for (const [index, heading] of explorationLeadHeadings(
      feature.properties?.headings,
    ).entries()) {
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
