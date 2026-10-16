import { describe, expect, it } from "vitest";
import {
  LANDMARK_ICON_OPTIONS,
  isLandmarkIcon,
  normalizeLandmarkIcon,
  buildLandmarkCollectionGroups,
} from "@speleodb/map-core";

describe("landmark icon contract", () => {
  it("accepts the five wire values and rejects unsupported mutation inputs", () => {
    expect(LANDMARK_ICON_OPTIONS.map(({ value }) => value)).toEqual([
      "DEFAULT",
      "CAVE",
      "UNKNOWN",
      "ATTENTION",
      "NOGO",
    ]);
    for (const { value } of LANDMARK_ICON_OPTIONS) {
      expect(isLandmarkIcon(value)).toBe(true);
      expect(normalizeLandmarkIcon(value)).toBe(value);
    }
    for (const value of [null, undefined, "", "cave", "other", 1]) {
      expect(isLandmarkIcon(value)).toBe(false);
      expect(normalizeLandmarkIcon(value)).toBe("DEFAULT");
    }
  });

  it("carries cached GeoJSON icons into collection grouping", () => {
    const groups = buildLandmarkCollectionGroups({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "one",
          properties: { name: "A", icon: "CAVE", collection_color: "#abcdef" },
          geometry: { type: "Point", coordinates: [1, 2] },
        },
        {
          type: "Feature",
          id: "two",
          properties: { name: "B" },
          geometry: { type: "Point", coordinates: [1, 2] },
        },
      ],
    });
    expect(groups[0]!.landmarks.map(({ icon }) => icon)).toEqual([
      "CAVE",
      "DEFAULT",
    ]);
  });
});
