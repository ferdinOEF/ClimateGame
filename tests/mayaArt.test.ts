import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allCurlCentres, FEATURE_BOXES, fullFigureSvg, hudFigureSvg, MAYA_PALETTE, onFace, paletteStyle } from "../src/ui/panjim/mayaArt";

/**
 * Section 1b: Maya's artwork. The rules the brief makes hard: no ringlet in
 * the face, nothing ever over her eyes, brows, nose or mouth, the same curls
 * on every load, and the palette defined once.
 */

/** Every polyline's points in the part of an SVG string drawn over the face (the last maya-head group). */
function frontCurls(svg: string): { pts: [number, number][]; w: number }[] {
  const front = svg.slice(svg.lastIndexOf('<g class="maya-head">'));
  const out: { pts: [number, number][]; w: number }[] = [];
  for (const m of front.matchAll(/<polyline points="([^"]+)"[^>]*stroke-width="([\d.]+)"/g)) {
    out.push({ pts: m[1].split(" ").map((p) => p.split(",").map(Number) as [number, number]), w: Number(m[2]) });
  }
  return out;
}

describe("Maya's hair", () => {
  it("never puts a ringlet's centre within about 1.2x the face", () => {
    const { ringlets } = allCurlCentres();
    expect(ringlets.length).toBeGreaterThan(100);
    for (const [x, y] of ringlets) expect(onFace(x, y), `${x.toFixed(1)},${y.toFixed(1)}`).toBe(false);
  });

  it("never draws a curl over her brows, eyes, nose or mouth (every stroke, at its width)", () => {
    const curls = frontCurls(hudFigureSvg(118, 136));
    // Most of the front ringlets and the fringe are drawn (a few are left out to keep the face clear).
    expect(curls.length).toBeGreaterThan(120);
    for (const { pts, w } of curls) {
      for (const [x, y] of pts) {
        for (const [name, [x1, y1, x2, y2]] of Object.entries(FEATURE_BOXES)) {
          const touches = x + w / 2 > x1 && x - w / 2 < x2 && y + w / 2 > y1 && y - w / 2 < y2;
          expect(touches, `curl at ${x.toFixed(1)},${y.toFixed(1)} over the ${name}`).toBe(false);
        }
      }
    }
  });

  it("keeps the fringe on the forehead, above the brows", () => {
    const { fringe } = allCurlCentres();
    expect(fringe).toHaveLength(21);
    for (const [, y] of fringe) expect(y).toBeLessThan(FEATURE_BOXES.brows[1]);
  });

  it("is seeded: the same curls on every call, so she never shimmers or re-scatters", () => {
    expect(hudFigureSvg(118, 136)).toBe(hudFigureSvg(118, 136));
    expect(fullFigureSvg({ pack: true, width: 200, height: 490 })).toBe(fullFigureSvg({ pack: true, width: 200, height: 490 }));
  });
});

describe("Maya's figure", () => {
  it("keeps every hook her states animate", () => {
    const svg = hudFigureSvg(118, 136);
    for (const cls of ["maya-body", "maya-torso", "maya-head", "maya-eyes", "maya-brow-l", "maya-brow-r", "maya-mouth-smile", "maya-mouth-o", "maya-mouth-worry", "maya-arm-l", "maya-arm-r", "maya-sweat", "maya-bulb", "maya-alert", "maya-stars"]) {
      expect(svg, cls).toContain(cls);
    }
  });

  it("wears the pack only in the full-figure variant that asks for it", () => {
    const pack = MAYA_PALETTE.pack;
    expect(fullFigureSvg({ pack: true, width: 200, height: 490 })).toContain(pack);
    expect(fullFigureSvg({ pack: false, width: 200, height: 490 })).not.toContain(pack);
    expect(hudFigureSvg(118, 136)).not.toContain("--maya-pack)");
  });

  it("holds the binoculars in one hand: brass lens rims, drawn before the fist", () => {
    const svg = fullFigureSvg({ pack: true, width: 200, height: 490 });
    expect(svg.split(MAYA_PALETTE["lens-rim"]).length - 1).toBe(2);
    // The fist (its four finger ridges are the skin-toned strokes) comes after the lens rims.
    expect(svg.indexOf(MAYA_PALETTE["lens-rim"])).toBeLessThan(svg.indexOf('stroke-width="3.2"'));
  });
});

describe("Maya's palette", () => {
  it("is defined once: no colour literal in the art outside the palette table", () => {
    const source = readFileSync("src/ui/panjim/mayaArt.ts", "utf8");
    const table = source.slice(source.indexOf("export const MAYA_PALETTE"), source.indexOf("} as const;"));
    const rest = source.replace(table, "");
    expect(rest.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
  });

  it("carries the brief's colours", () => {
    expect(MAYA_PALETTE.skin).toBe("#c98f68");
    expect(MAYA_PALETTE.shirt).toBe("#2f7d6e");
    expect(MAYA_PALETTE["hair-base"]).toBe("#33200f");
    expect(MAYA_PALETTE["lens-rim"]).toBe("#d8b45c");
    // The live figure reads each one as a CSS custom property set on its root.
    expect(paletteStyle()).toContain("--maya-shirt:#2f7d6e");
    expect(hudFigureSvg(118, 136)).toContain("var(--maya-shirt)");
  });
});
