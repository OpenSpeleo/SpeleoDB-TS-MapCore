import type { FeatureCollection, Position } from "geojson";
import { describe, expect, it } from "vitest";
import { clipSurveyGeoJSONSteps } from "../src/survey-clipping.js";
import { createPreparationRunner } from "../src/preparation.js";

const point = (x: number, y: number, z?: number): Position =>
  z === undefined ? [x / 1000, y / 1000] : [x / 1000, y / 1000, z];
const polygon = (vertices: number[][]) => ({
  type: "Polygon",
  coordinates: [vertices.map(([x, y]) => point(x!, y!))],
});
const square = polygon([
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
]);
const concave = polygon([
  [0, 0],
  [10, 0],
  [10, 10],
  [7, 10],
  [7, 3],
  [3, 3],
  [3, 10],
  [0, 10],
  [0, 0],
]);

function clip(data: unknown, bound: unknown = square) {
  const steps = clipSurveyGeoJSONSteps(data, bound);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
function line(...positions: Position[]) {
  return { type: "LineString", coordinates: positions };
}
function geometries(data: unknown, bound: unknown = square) {
  return clip(data, bound).features.map((feature) => feature.geometry);
}

describe("survey geographic clipping", () => {
  it("keeps points inside and on every boundary, excludes outside", () => {
    const coordinates = [
      point(5, 5, -10),
      point(0, 0),
      point(10, 10),
      point(0, 5),
      point(5, 0),
      point(10, 5),
      point(5, 10),
    ];
    const result = clip({
      type: "MultiPoint",
      coordinates: [
        ...coordinates,
        point(-1, 5),
        point(11, 5),
        point(5, -1),
        point(5, 11),
      ],
    });
    expect(result.features.map(({ geometry }) => geometry.coordinates)).toEqual(
      coordinates,
    );
  });

  it("clips a crossing with both endpoints outside and interpolates elevation", () => {
    const [geometry] = geometries(line(point(-5, 5, -20), point(15, 5, -60)));
    expect(geometry?.type).toBe("LineString");
    const coordinates = geometry!.coordinates as Position[];
    expect(coordinates[0]).toEqual(point(0, 5, -30));
    expect(coordinates[1]![0]).toBeCloseTo(0.01, 14);
    expect(coordinates[1]!.slice(1)).toEqual([0.005, -50]);
  });

  it("preserves contiguous inside vertices and clips exiting/reentering lines", () => {
    expect(
      geometries(line(point(-5, 5), point(5, 5), point(15, 5), point(5, 5))),
    ).toEqual([
      line(point(0, 5), point(5, 5), point(10, 5)),
      line(point(10, 5), point(5, 5)),
    ]);
  });

  it("splits concave crossings without bridging the outside gap", () => {
    const result = geometries(line(point(-2, 5), point(12, 5)), concave);
    expect(result).toHaveLength(2);
    const first = result[0] as { coordinates: Position[] };
    const second = result[1] as { coordinates: Position[] };
    expect(first.coordinates[0]![0]).toBeCloseTo(0, 14);
    expect(first.coordinates[1]![0]).toBeCloseTo(0.003, 14);
    expect(second.coordinates[0]![0]).toBeCloseTo(0.007, 14);
    expect(second.coordinates[1]![0]).toBeCloseTo(0.01, 14);
  });

  it("retains collinear edges in both directions and drops corner-only touches", () => {
    for (const [start, end, y] of [
      [-5, 15, 0],
      [15, -5, 10],
    ]) {
      const result = geometries(line(point(start!, y!), point(end!, y!)));
      expect(result).toHaveLength(1);
      const coordinates = result[0]!.coordinates as Position[];
      expect(coordinates[0]![0]).toBeCloseTo(start! < end! ? 0 : 0.01, 14);
      expect(coordinates[1]![0]).toBeCloseTo(start! < end! ? 0.01 : 0, 14);
      expect(coordinates.map((coordinate) => coordinate[1])).toEqual([
        y! / 1000,
        y! / 1000,
      ]);
    }
    expect(geometries(line(point(-5, 5), point(5, -5)))).toEqual([]);
    expect(geometries(line(point(0, 0), point(-5, -5)))).toEqual([]);
  });

  it("handles diagonal corners, reversed winding and translated geographic coordinates", () => {
    const translated = (values: Position[]) =>
      values.map(([x, y, ...rest]) => [-87 + x!, 20 + y!, ...rest]);
    const bound = {
      type: "Polygon",
      coordinates: [translated([...square.coordinates[0]!].reverse())],
    };
    const result = geometries(
      line(...translated([point(-5, -5), point(15, 15)])),
      bound,
    );
    expect(result).toHaveLength(1);
    const positions = result[0]!.coordinates as Position[];
    expect(positions[0]![0]).toBeCloseTo(-87, 12);
    expect(positions[0]![1]).toBeCloseTo(20, 12);
    expect(positions[1]![0]).toBeCloseTo(-86.99, 12);
    expect(positions[1]![1]).toBeCloseTo(20.01, 12);
  });

  it("handles wholly inside/outside and degenerate zero-length lines", () => {
    expect(geometries(line(point(1, 1), point(2, 2)))).toEqual([
      line(point(1, 1), point(2, 2)),
    ]);
    expect(geometries(line(point(-2, 1), point(-1, 2)))).toEqual([]);
    expect(geometries(line(point(2, 2), point(2, 2)))).toEqual([]);
    expect(
      geometries(line(point(1, 1), point(2, 2), point(2, 2), point(3, 3))),
    ).toEqual([line(point(1, 1), point(2, 2), point(3, 3))]);
  });

  it("preserves vertical shafts and their depth when horizontally inside", () => {
    const shaft = line(point(5, 5, -10), point(5, 5, -100));
    expect(geometries(shaft)).toEqual([shaft]);
    expect(geometries(line(point(-1, 5, -10), point(-1, 5, -100)))).toEqual([]);
  });

  it("flattens multipart lines with deterministic unique IDs and unchanged properties", () => {
    const properties = {
      id: "original",
      depth: -4,
      color: "#112233",
      stations: ["A", "B"],
    };
    const source: FeatureCollection = {
      type: "FeatureCollection",
      bbox: [-1, -1, 1, 1],
      features: [
        {
          type: "Feature",
          id: "source",
          bbox: [-1, -1, 1, 1],
          properties,
          geometry: {
            type: "MultiLineString",
            bbox: [-1, -1, 1, 1],
            coordinates: [
              [point(-2, 5), point(12, 5)],
              [point(1, 1), point(2, 2)],
            ],
          },
        },
      ],
    };
    const before = structuredClone(source);
    const result = clip(source, concave);
    expect(source).toEqual(before);
    expect(result.features).toHaveLength(3);
    expect(new Set(result.features.map(({ id }) => id)).size).toBe(3);
    expect(result.features.map(({ id }) => id)).toEqual(
      clip(source, concave).features.map(({ id }) => id),
    );
    expect(result).not.toHaveProperty("bbox");
    for (const feature of result.features) {
      expect(feature.properties).toEqual(properties);
      expect(feature).not.toHaveProperty("bbox");
      expect(feature.geometry).not.toHaveProperty("bbox");
    }
    const first = result.features[0]!.geometry.coordinates as Position[];
    first[0]![0] = 10;
    expect(source).toEqual(before);
  });

  it.each([
    null,
    {},
    { type: "FeatureCollection", features: null },
    { type: "Point", coordinates: [0, NaN] },
    { type: "Point", coordinates: [true, 0] },
    { type: "Point", coordinates: [0, 0, Infinity] },
    { type: "Point", coordinates: [0, 0, 0, 0] },
    { type: "Point", coordinates: [181, 0] },
    { type: "Point", coordinates: [0, 91] },
    { type: "Polygon", coordinates: square.coordinates },
    {
      type: "GeometryCollection",
      geometries: [{ type: "Point", coordinates: point(1, 1) }],
    },
    line(point(1, 1)),
    line(point(1, 1), [NaN, 1]),
    line(point(1, 1), point(2, 2, 1)),
    line([179, 0], [-179, 0]),
    { type: "MultiLineString", coordinates: null },
    {
      type: "Feature",
      properties: "invalid",
      geometry: line(point(1, 1), point(2, 2)),
    },
  ])("excludes unsupported or malformed data: %j", (data) => {
    expect(clip(data).features).toEqual([]);
  });

  it("discards a whole malformed line without losing valid siblings", () => {
    const data = {
      type: "MultiLineString",
      coordinates: [
        [point(1, 1), point(2, 2), null],
        [point(3, 3), point(4, 4)],
      ],
    };
    expect(geometries(data)).toEqual([line(point(3, 3), point(4, 4))]);
  });

  it.each([
    null,
    {},
    line(point(1, 1), point(2, 2)),
    polygon([
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
      [0, 0],
    ]),
    {
      type: "Polygon",
      coordinates: [...square.coordinates, ...square.coordinates],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [Array.from({ length: 102 }, () => [0, 0])],
    },
  ])(
    "rejects invalid bounds instead of returning unrestricted data: %j",
    (bound) => {
      expect(() => clip(line(point(1, 1), point(2, 2)), bound)).toThrow();
    },
  );

  it("yields within one long line and supports cancellation through the existing runner", async () => {
    let current = true;
    let slices = 0;
    const run = createPreparationRunner({
      budgetMs: Infinity,
      maxSteps: 20,
      initialYield: false,
    });
    const source = line(
      ...Array.from({ length: 2000 }, (_, index) =>
        point(index % 2 ? 2 : 1, 1),
      ),
    );
    const before = structuredClone(source);
    await expect(
      run(clipSurveyGeoJSONSteps(source, square), {
        isCurrent: () => current,
        yieldWork: async () => {
          slices += 1;
          current = false;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(slices).toBe(1);
    expect(source).toEqual(before);
  });

  it("works with the preparation runner and yields for empty multipart containers", async () => {
    let slices = 0;
    const run = createPreparationRunner({
      budgetMs: Infinity,
      maxSteps: 10,
      initialYield: false,
    });
    const data = {
      type: "MultiLineString",
      coordinates: Array.from({ length: 100 }, () => []),
    };
    const result = await run(clipSurveyGeoJSONSteps(data, square), {
      yieldWork: async () => {
        slices += 1;
      },
    });
    expect(result.features).toEqual([]);
    expect(slices).toBeGreaterThanOrEqual(10);
  });

  it("never mutates deeply frozen inputs", () => {
    const freeze = (value: unknown): void => {
      if (value && typeof value === "object") {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    const source = {
      type: "Feature",
      properties: { nested: { name: "survey" } },
      geometry: line(point(-5, 5), point(15, 5)),
    };
    freeze(source);
    expect(clip(source).features).toHaveLength(1);
  });
});
