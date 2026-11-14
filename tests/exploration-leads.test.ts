import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { buildExplorationLeadCones } from "../src/exploration-leads.js";
import { calculateDistanceInMeters } from "../src/geo.js";

function leads(latitude: number, headings: unknown): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "lead",
        properties: { project: "project", headings },
        geometry: { type: "Point", coordinates: [-87, latitude] },
      },
    ],
  };
}

describe("exploration lead cones", () => {
  it.each([0, 20, 65])(
    "keeps three directions fifteen metres long at latitude %s",
    (latitude) => {
      const input = leads(latitude, [0, 90, 337.5]);
      const before = JSON.stringify(input);
      const cones = buildExplorationLeadCones(input);
      expect(cones.features).toHaveLength(3);
      for (const cone of cones.features) {
        const ring = cone.geometry.coordinates[0]!;
        expect(ring[0]).toEqual([-87, latitude]);
        expect(ring.at(-1)).toEqual(ring[0]);
        for (const point of ring.slice(1, -1)) {
          expect(calculateDistanceInMeters(ring[0]!, point)).toBeCloseTo(15, 5);
        }
        expect(cone.properties).toMatchObject({
          project: "project",
          headings: [0, 90, 337.5],
        });
      }
      const north = cones.features[0]!.geometry.coordinates[0]!;
      const east = cones.features[1]!.geometry.coordinates[0]!;
      expect(north[Math.floor(north.length / 2)]![1]).toBeGreaterThan(latitude);
      expect(east[Math.floor(east.length / 2)]![0]).toBeGreaterThan(-87);
      expect(new Set(cones.features.map((feature) => feature.id)).size).toBe(3);
      expect(JSON.stringify(input)).toBe(before);
    },
  );

  it.each([undefined, null, [], [-1], [360], [NaN], [Infinity], ["90"]])(
    "does not draw unset or malformed headings: %s",
    (headings) => {
      expect(buildExplorationLeadCones(leads(20, headings)).features).toEqual(
        [],
      );
    },
  );

  it("keeps antimeridian cones local instead of spanning the world", () => {
    const input = leads(20, [90]);
    input.features[0]!.geometry = {
      type: "Point",
      coordinates: [179.999999, 20],
    };
    const ring =
      buildExplorationLeadCones(input).features[0]!.geometry.coordinates[0]!;
    expect(
      Math.max(...ring.map((point) => point[0]!)) -
        Math.min(...ring.map((point) => point[0]!)),
    ).toBeLessThan(0.001);
  });
});
