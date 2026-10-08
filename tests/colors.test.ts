import { describe, it, expect } from "vitest";
import { isHexColor, safeHexColor } from "@speleodb/map-core/colors";
describe("model colors", () => {
  it.each(["#94a3b8", "#AABBcc"])("accepts stored RGB hex %s", (color) => {
    expect(isHexColor(color)).toBe(true);
    expect(safeHexColor(color, "#000000")).toBe(color);
  });
  it.each([null, undefined, "#abc", "red", "#ffffff; color:red", 123])(
    "rejects unsafe/non-model color %s",
    (color) => {
      expect(isHexColor(color)).toBe(false);
      expect(safeHexColor(color, "#000000")).toBe("#000000");
    },
  );
});
