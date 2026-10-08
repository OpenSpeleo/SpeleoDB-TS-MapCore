import { describe, expect, it } from "vitest";
import { isEffectivelyVisible } from "@speleodb/map-core/visibility";

describe("effective project visibility", () => {
  it.each([
    [false, false, false, false],
    [false, false, true, false],
    [false, true, false, false],
    [false, true, true, false],
    [true, false, false, false],
    [true, false, true, false],
    [true, true, false, false],
    [true, true, true, true],
  ])(
    "composes individual=%s country=%s eligibility=%s into %s",
    (individual, country, eligible, expected) => {
      expect(isEffectivelyVisible({ individual, country, eligible })).toBe(
        expected,
      );
    },
  );
  it("allows consumers without a separate readiness gate", () => {
    expect(isEffectivelyVisible({ individual: true, country: true })).toBe(
      true,
    );
  });
});
