import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import {
  buildExplorationLeadCones,
  parseExplorationLeadDirections,
  isExplorationLeadFullyChecked,
  type ExplorationLeadDirection,
} from "../src/exploration-leads.js";
import { calculateDistanceInMeters } from "../src/geo.js";

function leads(latitude: number, directions: unknown): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "lead",
        properties: { project: "project", directions },
        geometry: { type: "Point", coordinates: [-87, latitude] },
      },
    ],
  };
}

describe("exploration lead cones", () => {
  it("draws only the unchecked direction from a checked-state overlay", () => {
    const input = leads(20, []);
    input.features[0]!.properties = {
      directions: [
        { heading: 0, checked: true },
        { heading: 90, checked: false },
        { heading: null, checked: false },
      ],
    };
    const cones = buildExplorationLeadCones(input);
    expect(cones.features).toHaveLength(1);
    const ring = cones.features[0]!.geometry.coordinates[0]!;
    expect(ring[Math.floor(ring.length / 2)]![0]).toBeGreaterThan(-87);
  });

  it.each([0, 20, 65])(
    "keeps three directions fifteen metres long at latitude %s",
    (latitude) => {
      const input = leads(
        latitude,
        [0, 90, 337.5].map((heading) => ({ heading, checked: false })),
      );
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
          directions: [0, 90, 337.5].map((heading) => ({
            heading,
            checked: false,
          })),
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

  it("keeps antimeridian cones local instead of spanning the world", () => {
    const input = leads(20, [{ heading: 90, checked: false }]);
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

describe("exploration lead checked state", () => {
  for (const length of [1, 2, 3]) {
    for (let mask = 0; mask < 2 ** length; mask++) {
      it(`preserves all ${length} entries with checked mask ${mask}`, () => {
        const directions: ExplorationLeadDirection[] = Array.from(
          { length },
          (_, index) => ({
            heading: index * 90,
            checked: Boolean(mask & (1 << index)),
          }),
        );
        const parsed = parseExplorationLeadDirections(directions)!;
        expect(parsed).toEqual(directions);
        expect(parsed).not.toBe(directions);
        expect(parsed[0]).not.toBe(directions[0]);
        expect(isExplorationLeadFullyChecked(parsed)).toBe(
          mask === 2 ** length - 1,
        );
        const cones = buildExplorationLeadCones(leads(20, parsed));
        const uncheckedIndices = directions.flatMap((entry, index) =>
          entry.checked ? [] : index,
        );
        expect(cones.features.map((feature) => feature.id)).toEqual(
          uncheckedIndices.map((index) => `lead:heading:${index}`),
        );
      });
    }
  }

  it.each([false, true])(
    "supports an undirected lead with checked=%s",
    (checked) => {
      const directions = [{ heading: null, checked }];
      expect(parseExplorationLeadDirections(directions)).toEqual(directions);
      expect(isExplorationLeadFullyChecked(directions)).toBe(checked);
      expect(buildExplorationLeadCones(leads(20, directions)).features).toEqual(
        [],
      );
    },
  );

  it("keeps duplicate bearings independently checked", () => {
    const directions = [
      { heading: 22.5, checked: true },
      { heading: 22.5, checked: false },
    ];
    expect(parseExplorationLeadDirections(directions)).toEqual(directions);
    expect(isExplorationLeadFullyChecked(directions)).toBe(false);
    expect(
      buildExplorationLeadCones(leads(20, directions)).features.map(
        (feature) => feature.id,
      ),
    ).toEqual(["lead:heading:1"]);
  });

  it.each([
    null,
    undefined,
    [],
    [null],
    [0],
    [true],
    [90],
    [{ heading: 360, checked: false }],
    [{ heading: -1, checked: false }],
    [{ heading: NaN, checked: false }],
    [{ heading: Infinity, checked: false }],
    [{ heading: true, checked: false }],
    [{ heading: "90", checked: false }],
    [{ heading: 90, checked: "true" }],
    [{ heading: 90 }],
    [{ checked: false }],
    Array.from({ length: 4 }, () => ({ heading: 90, checked: false })),
    Array.from({ length: 2 }),
  ])(
    "rejects invalid records without dropping individual leads: %j",
    (value) => {
      expect(parseExplorationLeadDirections(value)).toBeNull();
      expect(buildExplorationLeadCones(leads(20, value)).features).toEqual([]);
    },
  );

  it("does not consider an empty list fully checked", () => {
    expect(isExplorationLeadFullyChecked([])).toBe(false);
  });
});
