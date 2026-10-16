import { describe, expect, it } from "vitest";
import { mergedArea, shapeCount } from "../src/core/areaShape";

describe("the area to protect as one shape (Section 14)", () => {
  it("joins tiles one gap apart into one outline and keeps far ones apart", () => {
    // Two tiles with one empty tile between them: one shape once merged.
    expect(shapeCount(["0,0", "2,0"])).toBe(2);
    expect(shapeCount(mergedArea(["0,0", "2,0"]))).toBe(1);
    // Far apart: still two.
    expect(shapeCount(mergedArea(["0,0", "8,0"]))).toBe(2);
    // Two tiles three apart: one shape with the default reach of 2.
    expect(shapeCount(mergedArea(["0,0", "3,0"]))).toBe(1);
    // Every original tile stays in.
    for (const key of ["0,0", "2,0"]) expect(mergedArea(["0,0", "2,0"])).toContain(key);
  });
});
