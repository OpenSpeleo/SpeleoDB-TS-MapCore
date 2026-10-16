import { describe, expect, it } from "vitest";
import type { LineString, Polygon } from "geojson";
import {
  createGeometryLabelFeature,
  isGeometryAliasValid,
} from "@speleodb/map-core";

const rectangle: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0.02, 0],
      [0.02, 0.01],
      [0, 0.01],
      [0, 0],
    ],
  ],
};
function label(geometry: LineString | Polygon, alias = "Entrance") {
  return createGeometryLabelFeature({
    id: "geometry-id",
    alias,
    color: "#123456",
    geometry,
  });
}

describe("geometry aliases", () => {
  it("uses the server's Unicode code-point limit without requiring a value", () => {
    expect(isGeometryAliasValid("")).toBe(true);
    expect(isGeometryAliasValid("🦇".repeat(32))).toBe(true);
    expect(isGeometryAliasValid("🦇".repeat(33))).toBe(false);
    expect(isGeometryAliasValid(null)).toBe(false);
    expect(isGeometryAliasValid(32)).toBe(false);
  });
});

describe("stable geometry label anchors", () => {
  it("centers a polygon and retains identity and literal alias text", () => {
    const result = label(rectangle, "<Entrance>")!;
    expect(result.id).toBe("geometry-id");
    expect(result.properties).toEqual({
      id: "geometry-id",
      alias: "<Entrance>",
      color: "#123456",
      geometry_type: "Polygon",
    });
    expect(result.geometry.coordinates[0]).toBeCloseTo(0.01, 6);
    expect(result.geometry.coordinates[1]).toBeCloseTo(0.005, 6);
  });

  it("places a concave polygon's label inside even when its centroid is outside", () => {
    const polygon: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.04, 0],
          [0.04, 0.04],
          [0.03, 0.04],
          [0.03, 0.01],
          [0.01, 0.01],
          [0.01, 0.04],
          [0, 0.04],
          [0, 0],
        ],
      ],
    };
    for (const ring of [
      polygon.coordinates[0]!,
      [...polygon.coordinates[0]!].reverse(),
    ]) {
      const [x, y] = label({ type: "Polygon", coordinates: [ring] })!.geometry
        .coordinates;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(0.04);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(0.04);
      expect(y! < 0.01 || x! < 0.01 || x! > 0.03).toBe(true);
    }
  });

  it("handles extreme aspect ratios without a subdivision grid proportional to length", () => {
    const result = label({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.04, 0],
          [0.04, 1e-12],
          [0, 1e-12],
          [0, 0],
        ],
      ],
    })!;
    expect(result.geometry.coordinates[0]).toBeCloseTo(0.02, 10);
    expect(result.geometry.coordinates[1]).toBeGreaterThan(0);
    expect(result.geometry.coordinates[1]).toBeLessThan(1e-12);
  });

  it("uses distance along the complete polyline instead of the midpoint vertex", () => {
    const result = label({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.001, 0],
        [0.009, 0],
      ],
    })!;
    expect(result.geometry.coordinates[0]).toBeCloseTo(0.0045, 10);
    expect(result.geometry.coordinates[1]).toBe(0);
  });

  it("preserves the geometry contract's rejection of repeated adjacent vertices", () => {
    expect(
      label({
        type: "LineString",
        coordinates: [
          [0, 0],
          [0, 0],
          [0.001, 0],
        ],
      }),
    ).toBeNull();
  });

  it("interpolates on the segment containing half the rendered length", () => {
    const result = label({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.002, 0],
        [0.002, 0.006],
      ],
    })!;
    expect(result.geometry.coordinates[0]).toBeCloseTo(0.002, 10);
    expect(result.geometry.coordinates[1]).toBeCloseTo(0.002, 8);
  });

  it("retains finite polar and tiny coordinates", () => {
    const polar = label({
      type: "LineString",
      coordinates: [
        [0, 89.9],
        [0.01, 89.9],
      ],
    })!;
    expect(polar.geometry.coordinates).toEqual([0.005, 89.9]);
    const tiny = label({
      type: "LineString",
      coordinates: [
        [0, 0],
        [1e-12, 1e-12],
      ],
    })!;
    expect(tiny.geometry.coordinates[0]).toBeGreaterThan(0);
    expect(tiny.geometry.coordinates[1]).toBeGreaterThan(0);
    expect(tiny.geometry.coordinates[0]).toBeLessThan(1e-12);
  });

  it("does not label blank/invalid aliases or invalid geometries and leaves input untouched", () => {
    const before = structuredClone(rectangle);
    expect(label(rectangle, "  ")).toBeNull();
    expect(label(rectangle, "a".repeat(33))).toBeNull();
    expect(label({ type: "LineString", coordinates: [[0, 0]] })).toBeNull();
    label(rectangle);
    expect(rectangle).toEqual(before);
  });
});
