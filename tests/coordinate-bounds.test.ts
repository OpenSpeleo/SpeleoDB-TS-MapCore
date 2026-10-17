import { describe, expect, it } from "vitest";
import {
  createCoordinateBounds,
  decodeGeoJSONBBox,
} from "../src/coordinate-bounds.js";
import {
  createPreparationRunner,
  geometryPositionSteps,
} from "../src/preparation.js";
import type { Geometry } from "geojson";

describe("camera coordinate bounds", () => {
  it.each([
    {
      points: [
        [-88, 20],
        [-87, 21],
      ],
      expected: [
        [-88, 20],
        [-87, 21],
      ],
    },
    {
      points: [
        [-179, 20],
        [179, 21],
        [-67, 22],
      ],
      expected: [
        [179, 20],
        [293, 22],
      ],
    },
    {
      points: [
        [539, 1],
        [-539, 2],
      ],
      expected: [
        [179, 1],
        [181, 2],
      ],
    },
    {
      points: [
        [-180, 0],
        [180, 1],
      ],
      expected: [
        [180, 0],
        [180, 1],
      ],
    },
    {
      points: [
        [0, 0],
        [180, 1],
      ],
      expected: [
        [180, 0],
        [360, 1],
      ],
    },
    {
      points: [
        [180, 1],
        [0, 0],
      ],
      expected: [
        [180, 0],
        [360, 1],
      ],
    },
    {
      points: [
        [-10, 2],
        [-10, 2],
      ],
      expected: [
        [-10, 2],
        [-10, 2],
      ],
    },
  ])(
    "preserves wrapped camera representation for $points",
    ({ points, expected }) => {
      const bounds = createCoordinateBounds();
      for (const point of points) bounds.extend(Object.freeze(point));
      expect(bounds.finish()).toEqual(expected);
      expect(bounds.finish()).toEqual(expected);
    },
  );

  it("retains full authoring extent when wrapping is disabled", () => {
    const bounds = createCoordinateBounds({ wrapLongitude: false });
    for (const position of [
      [-540, -2],
      [540, 3],
      [0, 0],
    ])
      bounds.extend(position);
    expect(bounds.finish()).toEqual([
      [-540, -2],
      [540, 3],
    ]);
  });

  it("skips incomplete/nonfinite positions and returns no invented extent", () => {
    const bounds = createCoordinateBounds();
    for (const position of [[], [1], [NaN, 1], [1, Infinity]])
      bounds.extend(position);
    expect(bounds.finish()).toBeNull();
    bounds.extend([2, 3, 500]);
    expect(bounds.finish()).toEqual([
      [2, 3],
      [2, 3],
    ]);
  });

  it("accepts finite latitude values without taking over strict validation or clamping", () => {
    const bounds = createCoordinateBounds();
    bounds.extend([1, 95]);
    expect(bounds.finish()).toEqual([
      [1, 95],
      [1, 95],
    ]);
  });

  it("combines with shared traversal across nested and empty geometries", () => {
    const geometry: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "GeometryCollection", geometries: [] },
        {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [-88, 20, 3] },
            {
              type: "LineString",
              coordinates: [
                [-87.5, 20.5],
                [-87, 21],
              ],
            },
          ],
        },
      ],
    };
    const before = structuredClone(geometry);
    const bounds = createCoordinateBounds();
    for (const position of geometryPositionSteps(geometry))
      if (position) bounds.extend(position);
    expect(bounds.finish()).toEqual([
      [-88, 20],
      [-87, 21],
    ]);
    expect(geometry).toEqual(before);
  });

  it("lets callers opt into bbox authority without visiting coordinates", () => {
    const bbox = decodeGeoJSONBBox([172, 18, -65, 72]);
    const bounds = createCoordinateBounds({ bbox });
    bounds.extend([0, 0]);
    expect(bounds.finish()).toBe(bbox);
    expect(bounds.finish()).toEqual([
      [172, 18],
      [295, 72],
    ]);
  });

  it("yields during sorting and the gap scan, with cancellation before publication", async () => {
    const bounds = createCoordinateBounds();
    for (let index = 255; index >= 0; index--)
      bounds.extend([index, index / 10]);
    const run = createPreparationRunner({
      budgetMs: 8,
      maxSteps: 32,
      now: () => 0,
      initialYield: false,
    });
    let yields = 0;
    let current = true;
    await expect(
      run(bounds.finishSteps(), {
        isCurrent: () => current,
        yieldWork: async () => {
          if (++yields === 18) current = false;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(yields).toBe(18);
    // Cancellation discards the result, not the caller's input. A new owner can
    // recompute from the same positions and retains deterministic tie behavior.
    let checkpoints = 0;
    const result = await run(bounds.finishSteps(), {
      yieldWork: async () => {
        checkpoints++;
      },
    });
    expect(checkpoints).toBeGreaterThan(8);
    expect(result).toEqual([
      [0, 0],
      [255, 25.5],
    ]);
  });
});

describe("GeoJSON bbox decoding", () => {
  it.each([
    {
      bbox: [-88, 20, -87, 21],
      expected: [
        [-88, 20],
        [-87, 21],
      ],
    },
    {
      bbox: [-88, 20, -10, -87, 21, 40],
      expected: [
        [-88, 20],
        [-87, 21],
      ],
    },
    {
      bbox: [172, 18, -65, 72],
      expected: [
        [172, 18],
        [295, 72],
      ],
    },
  ])("reads first two axes of $bbox", ({ bbox, expected }) => {
    expect(decodeGeoJSONBBox(Object.freeze(bbox))).toEqual(expected);
  });
  // Wrap array-valued inputs so each row supplies one bbox argument, even [].
  it.each([
    { name: "undefined", bbox: undefined },
    { name: "null", bbox: null },
    { name: "object", bbox: {} },
    { name: "empty array", bbox: [] },
    { name: "too few axes", bbox: [1, 2, 3] },
    { name: "odd axis count", bbox: [1, 2, 3, 4, 5] },
    { name: "nonfinite coordinate", bbox: [1, 2, Infinity, 4] },
    { name: "nonnumeric coordinate", bbox: [1, "2", 3, 4] },
  ])("rejects malformed metadata: $name", ({ bbox }) => {
    expect(decodeGeoJSONBBox(bbox)).toBeNull();
  });
});
