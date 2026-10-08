import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import {
  annotateFeatureDepths,
  computeCollectionDepthDomain,
  depthDomainFromValues,
  firstPropertyDepth,
  meanGeometryDepth,
} from "@speleodb/map-core/depth";

const strictNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

describe("shared depth mechanisms with caller-owned policies", () => {
  it("retains alias ordering and lets each application choose numeric parsing", () => {
    const properties = { depth: "12 ft", elevation: 99 };
    expect(
      firstPropertyDepth(properties, ["depth", "elevation"], strictNumber),
    ).toBe(99);
    expect(
      firstPropertyDepth(properties, ["depth", "elevation"], (value) => {
        const parsed =
          typeof value === "string" ? parseFloat(value) : strictNumber(value);
        return parsed != null && Number.isFinite(parsed) ? parsed : null;
      }),
    ).toBe(12);
    expect(
      firstPropertyDepth<Record<string, unknown>>(
        null,
        ["depth"],
        strictNumber,
      ),
    ).toBeNull();
    expect(
      firstPropertyDepth<Record<string, unknown>>({}, ["depth"], strictNumber),
    ).toBeNull();
  });

  it("averages position depth through nested geometry without changing altitude", () => {
    const geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [1, 2, 10] },
        {
          type: "MultiLineString",
          coordinates: [
            [
              [1, 2],
              [2, 3, 30],
            ],
            [],
          ],
        },
      ],
    } as const;
    const input = structuredClone(geometry) as unknown as GeoJSON.Geometry;
    expect(meanGeometryDepth(input, strictNumber)).toBe(20);
    expect(input).toEqual(geometry);
    expect(meanGeometryDepth(null, strictNumber)).toBeNull();
    expect(
      meanGeometryDepth({ type: "Point", coordinates: [1, 2] }, strictNumber),
    ).toBeNull();
  });

  it("copies only enriched features and keeps already prepared geometry/source identities", () => {
    const source: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [1, 2] },
          properties: { depth: 10 },
        },
        {
          type: "Feature",
          geometry: { type: "GeometryCollection", geometries: [] },
          properties: { depth: 20, normalized: "20" },
        },
        {
          type: "Feature",
          geometry: { type: "GeometryCollection", geometries: [] },
          properties: null,
        },
      ],
    };
    const resolveDepth = (feature: GeoJSON.Feature) =>
      strictNumber(feature.properties?.depth);
    const prepared = annotateFeatureDepths(source, {
      resolveDepth,
      property: "normalized",
      parseStoredDepth: (value) => (value == null ? null : Number(value)),
    });
    expect(prepared).not.toBe(source);
    expect(prepared.features[0]?.geometry).toBe(source.features[0]?.geometry);
    expect(prepared.features[0]?.properties).toEqual({
      depth: 10,
      normalized: 10,
    });
    expect(source.features[0]?.properties).toEqual({ depth: 10 });
    expect(prepared.features[1]).toBe(source.features[1]);
    expect(prepared.features[2]).toBe(source.features[2]);
    expect(
      annotateFeatureDepths(prepared, {
        resolveDepth,
        property: "normalized",
        parseStoredDepth: Number,
      }),
    ).toBe(prepared);
    expect(
      annotateFeatureDepths(source, {
        resolveDepth: () => null,
        property: "normalized",
      }),
    ).toBe(source);
  });

  it("derives zero-based domains from the caller-selected depths", () => {
    expect(depthDomainFromValues([])).toBeNull();
    expect(depthDomainFromValues([null, undefined])).toBeNull();
    expect(depthDomainFromValues([-10, -20])).toEqual({ min: 0, max: 0 });
    expect(depthDomainFromValues([20, Infinity, 100])).toEqual({
      min: 0,
      max: 100,
    });
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "GeometryCollection", geometries: [] },
          properties: { depth: 2, alternative: 40 },
        },
      ],
    };
    expect(
      computeCollectionDepthDomain([collection], (feature) =>
        strictNumber(feature.properties?.alternative),
      ),
    ).toEqual({ min: 0, max: 40 });
  });
});
