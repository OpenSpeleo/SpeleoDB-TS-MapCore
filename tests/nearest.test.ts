import { describe, expect, it } from "vitest";
import { calculateDistanceInMeters } from "../src/geo.js";
import { findNearestGeographicCandidate } from "../src/nearest.js";

describe("nearest geographic candidate", () => {
  it("keeps the closest candidate and its metadata by identity", () => {
    const farther = Object.freeze({ coordinates: [0, 2], name: "Farther" });
    const nearest = Object.freeze({ coordinates: [0, 0.5], name: "Nearest" });
    const result = findNearestGeographicCandidate([0, 0], [farther, nearest]);
    expect(result.candidate).toBe(nearest);
    expect(result.distance).toBe(
      calculateDistanceInMeters([0, 0], nearest.coordinates),
    );
  });

  it("preserves the first candidate on equal spherical distances", () => {
    const first = { coordinates: [-1, 0] };
    const second = { coordinates: [1, 0] };
    expect(
      findNearestGeographicCandidate([0, 0], [first, second]).candidate,
    ).toBe(first);
    expect(
      findNearestGeographicCandidate([0, 0], [second, first]).candidate,
    ).toBe(second);
  });

  it("closes lazy iteration immediately after the first exact match", () => {
    const exact = { coordinates: [1, 2], metadata: "owned" };
    let closed = false;
    function* candidates() {
      try {
        yield { coordinates: [2, 3] };
        yield exact;
        throw new Error("Later candidates must not be visited");
      } finally {
        closed = true;
      }
    }
    expect(findNearestGeographicCandidate([1, 2], candidates())).toEqual({
      candidate: exact,
      distance: 0,
    });
    expect(closed).toBe(true);
  });

  it("returns no candidate and infinite distance for empty or nonfinite positions", () => {
    for (const candidates of [
      [],
      [{ coordinates: [NaN, 0] }, { coordinates: [Infinity, 0] }],
    ]) {
      expect(findNearestGeographicCandidate([0, 0], candidates)).toEqual({
        candidate: null,
        distance: Infinity,
      });
    }
  });

  it.each([NaN, Infinity, -Infinity, -1])(
    "ignores invalid distance results (%s)",
    (invalidDistance) => {
      const invalid = { coordinates: [0] };
      const valid = { coordinates: [1] };
      expect(
        findNearestGeographicCandidate(
          [0, 0],
          [invalid, valid],
          (_origin, point) => (point[0] === 0 ? invalidDistance : 2),
        ),
      ).toEqual({ candidate: valid, distance: 2 });
    },
  );

  it("computes the short spherical distance across the antimeridian", () => {
    const across = { coordinates: [-179.9, 0] };
    const distant = { coordinates: [179, 0] };
    const result = findNearestGeographicCandidate(
      [179.9, 0],
      [distant, across],
    );
    expect(result.candidate).toBe(across);
    expect(result.distance).toBeGreaterThan(22_000);
    expect(result.distance).toBeLessThan(23_000);
  });

  it("accepts the caller's distance policy and preserves distance outside an app radius", () => {
    const candidate = { coordinates: [0, 1] };
    const policy = (a: readonly number[], b: readonly number[]) =>
      calculateDistanceInMeters(a, b, 6_378_137);
    const result = findNearestGeographicCandidate([0, 0], [candidate], policy);
    expect(result.candidate).toBe(candidate);
    expect(result.distance).toBe(policy([0, 0], candidate.coordinates));
    expect(result.distance).toBeGreaterThan(100_000);
  });
});
