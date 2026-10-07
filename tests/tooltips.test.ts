import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import copy from "../src/data/tooltips.json";
import { tooltipText, buildWhat } from "../src/ui/tooltip";
import { ELEMENT_DEFS } from "../src/core/elements";

/**
 * Every HUD tooltip's wording lives in src/data/tooltips.json. These check
 * that every key the code asks for exists (so no control silently shows
 * nothing), that every element has a build-menu description, and that live
 * values are filled in. The browser check (tools/phaseShots.ts and the P7
 * script) separately proves every HUD control carries a tooltip.
 */
const SOURCES = ["src/app/gameSession.ts", "src/app/panjimController.ts"].map((file) => fs.readFileSync(path.resolve(file), "utf8"));

describe("tooltip copy", () => {
  it("has a sentence for every key the code attaches", () => {
    const keys = new Set<string>();
    for (const source of SOURCES) {
      for (const match of source.matchAll(/attach\([^,]+,\s*"(\w+)"/g)) keys.add(match[1]);
      for (const match of source.matchAll(/tooltipText\("(\w+)"/g)) keys.add(match[1]);
      for (const match of source.matchAll(/\["biodiversity", "carbon", "food", "population"\]/g)) for (const key of ["biodiversity", "carbon", "food", "population"]) keys.add(key);
    }
    expect(keys.size).toBeGreaterThan(20);
    for (const key of keys) expect(typeof (copy as Record<string, unknown>)[key], key).toBe("string");
  });

  it("describes every element in the build menu", () => {
    for (const def of ELEMENT_DEFS) expect(buildWhat(def.id), def.id).not.toBe("");
  });

  it("fills live values, and leaves no raw placeholder", () => {
    const text = tooltipText("readiness", { pct: 72, storm: "flood", saved: 150, total: 181, stars: 2 });
    expect(text).toContain("Ready 72%");
    expect(text).toContain("150 of the 181 homes");
    expect(tooltipText("ffYear")).toBe("Pressing this will fast-forward the timeline by 1 year. Defences keep growing while you wait, but so does the sea.");
    expect(tooltipText("coin", {})).not.toMatch(/\{\w+\}/);
  });
});
