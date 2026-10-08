import { describe, it, expect } from "vitest";
import type { Geometry } from "geojson";
import {
  createPreparationRunner,
  geometryPositionSteps,
  transformGeometrySteps,
} from "@speleodb/map-core/preparation";

describe("cooperative geometry traversal", () => {
  it("visits nested positions in order and preserves altitude and source identity", () => {
    const geometry: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [1, 2, 3] },
        {
          type: "Polygon",
          coordinates: [
            [
              [4, 5, 6],
              [7, 8, 9],
            ],
          ],
        },
      ],
    };
    const before = structuredClone(geometry);
    expect([...geometryPositionSteps(geometry)].filter(Boolean)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    const positions: number[][] = [];
    const iterator = transformGeometrySteps(geometry, {
      visitPosition: (position) => positions.push(position),
    });
    let step = iterator.next();
    while (!step.done) step = iterator.next();
    expect(step.value).toBe(geometry);
    expect(positions).toHaveLength(3);
    expect(geometry).toEqual(before);
  });

  it("clones when flattening altitude and keeps empty-container work interruptible", () => {
    const geometry: Geometry = {
      type: "GeometryCollection",
      geometries: [
        {
          type: "LineString",
          coordinates: [
            [1, 2, 3],
            [4, 5, 6],
          ],
        },
        ...Array.from({ length: 10000 }, (): Geometry => ({
          type: "Polygon",
          coordinates: [],
        })),
      ],
    };
    const iterator = transformGeometrySteps(geometry, {
      flattenAltitude: true,
    });
    let checkpoints = 0;
    let step = iterator.next();
    while (!step.done) {
      checkpoints++;
      step = iterator.next();
    }
    expect(checkpoints).toBeGreaterThan(10000);
    expect(step.value).not.toBe(geometry);
    expect(step.value.geometries[0]).toEqual({
      type: "LineString",
      coordinates: [
        [1, 2, 0],
        [4, 5, 0],
      ],
    });
    expect(geometry.geometries[0]).toEqual({
      type: "LineString",
      coordinates: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
    expect([...geometryPositionSteps(geometry)].length).toBeGreaterThan(10000);
  });
});

describe("cooperative scheduling", () => {
  function* work(size: number): Generator<void, number> {
    for (let index = 0; index < size; index++) yield;
    return size;
  }

  it("honors step budgets without yielding small mobile work and closes stale publication", async () => {
    let turns = 0;
    const run = createPreparationRunner({
      budgetMs: Infinity,
      maxSteps: 1000,
      initialYield: false,
    });
    expect(
      await run(work(5000), {
        yieldWork: async () => {
          turns++;
        },
      }),
    ).toBe(5000);
    expect(turns).toBe(5);
    let current = true;
    await expect(
      run(work(2000), {
        isCurrent: () => current,
        yieldWork: async () => {
          current = false;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(
      await run(work(1), {
        yieldWork: async () => {
          throw new Error("unexpected yield");
        },
      }),
    ).toBe(1);
  });

  it("shares time allowance only within an instance and checks cancellation before work", async () => {
    let clock = 0;
    const run = createPreparationRunner({ budgetMs: 10, now: () => ++clock });
    let turns = 0;
    const yieldWork = async () => {
      turns++;
    };
    await Promise.all(
      Array.from({ length: 10 }, () => run(work(5), { yieldWork })),
    );
    expect(turns).toBeGreaterThan(10);
    let touched = false;
    function* stale(): Generator<void, void> {
      touched = true;
      yield;
    }
    await expect(
      run(stale(), { isCurrent: () => false }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(touched).toBe(false);
  });
});
