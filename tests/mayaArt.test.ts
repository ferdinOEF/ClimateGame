import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allCurlCentres,
  FEATURE_BOXES,
  featureMarkup,
  fullFigureSvg,
  fullFigureUrl,
  HUD_ARMS,
  HUD_FOREARM,
  HUD_VIEWBOX,
  hudFigureSvg,
  MAYA_PALETTE,
  paletteStyle
} from "../src/ui/panjim/mayaArt";

/**
 * Section 1b: Maya's artwork. The rules the brief makes hard: no ringlet in
 * the face, nothing ever over her eyes, brows, nose or mouth, the same curls
 * on every load, the palette defined once; and her gestures stay inside her
 * HUD box, where the layout manager keeps everything else clear of her.
 */

type Pt = [number, number];

/** Every polyline drawn over the face: in the HUD, the front hair layer (the second maya-hair group). */
function frontCurls(svg: string): { pts: Pt[]; w: number }[] {
  const start = svg.lastIndexOf('<g class="maya-head maya-hair">');
  const front = svg.slice(start, svg.indexOf("</g>", start));
  return [...front.matchAll(/<polyline points="([^"]+)"[^>]*stroke-width="([\d.]+)"/g)].map((m) => ({
    pts: m[1].split(" ").map((p) => p.split(",").map(Number) as Pt),
    w: Number(m[2])
  }));
}

/**
 * The bounding box of SVG markup made of paths (absolute M, relative q / l,
 * z), circles and ellipses, grown by half the stroke width; curves are
 * sampled along their length.
 */
function bbox(markup: string, transform: (p: Pt) => Pt = (p) => p): [number, number, number, number] {
  const pts: { p: Pt; pad: number }[] = [];
  for (const el of markup.matchAll(/<(path|circle|ellipse)\b([^>]*)\/>/g)) {
    const attr = (name: string): number => Number(new RegExp(`\\b${name}="([-\\d.]+)"`).exec(el[2])?.[1] ?? 0);
    const pad = attr("stroke-width") / 2;
    if (el[1] === "circle" || el[1] === "ellipse") {
      const rx = el[1] === "circle" ? attr("r") : attr("rx");
      const ry = el[1] === "circle" ? attr("r") : attr("ry");
      for (const [dx, dy] of [[-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]]) pts.push({ p: [attr("cx") + dx, attr("cy") + dy], pad });
      continue;
    }
    const d = /\bd="([^"]+)"/.exec(el[2])![1];
    const tokens = d.match(/[MmQqLlZz]|-?\d*\.?\d+/g)!;
    let cmd = "";
    let cur: Pt = [0, 0];
    for (let i = 0; i < tokens.length; ) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      if (cmd === "z" || cmd === "Z") continue;
      if (cmd === "M") {
        cur = [Number(tokens[i]), Number(tokens[i + 1])];
        i += 2;
      } else if (cmd === "q") {
        const c: Pt = [cur[0] + Number(tokens[i]), cur[1] + Number(tokens[i + 1])];
        const e: Pt = [cur[0] + Number(tokens[i + 2]), cur[1] + Number(tokens[i + 3])];
        // Points along the curve itself (its control point lies outside the drawn shape).
        for (let k = 1; k < 16; k++) {
          const t = k / 16;
          const a = (1 - t) * (1 - t);
          const b = 2 * (1 - t) * t;
          const q = t * t;
          pts.push({ p: [a * cur[0] + b * c[0] + q * e[0], a * cur[1] + b * c[1] + q * e[1]], pad });
        }
        cur = e;
        i += 4;
      } else if (cmd === "l") {
        cur = [cur[0] + Number(tokens[i]), cur[1] + Number(tokens[i + 1])];
        i += 2;
      } else throw new Error(`unhandled path command ${cmd} in ${d}`);
      pts.push({ p: cur, pad });
    }
  }
  const xs = pts.flatMap(({ p, pad }) => [transform(p)[0] - pad, transform(p)[0] + pad]);
  const ys = pts.flatMap(({ p, pad }) => [transform(p)[1] - pad, transform(p)[1] + pad]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const rotateAbout = (c: Pt, deg: number, dy = 0) => ([x, y]: Pt): Pt => {
  const t = (deg * Math.PI) / 180;
  return [c[0] + (x - c[0]) * Math.cos(t) - (y - c[1]) * Math.sin(t), c[1] + dy + (x - c[0]) * Math.sin(t) + (y - c[1]) * Math.cos(t)];
};

const inside = (b: number[], box: number[]): boolean => b[0] >= box[0] && b[1] >= box[1] && b[2] <= box[2] && b[3] <= box[3];

describe("Maya's face is never covered", () => {
  it("the protected boxes contain every drawn feature, in every expression and brow pose", () => {
    const f = featureMarkup();
    expect(inside(bbox(f.eyes), FEATURE_BOXES.eyes), `eyes ${bbox(f.eyes)}`).toBe(true);
    expect(inside(bbox(f.nose), FEATURE_BOXES.nose), `nose ${bbox(f.nose)}`).toBe(true);
    expect(inside(bbox(f.mouth), FEATURE_BOXES.mouth), `mouth ${bbox(f.mouth)}`).toBe(true);
    // The brows, as drawn and as the states move them (panjim.css): worried tilts them 12 degrees, a warning lifts 1.5 and tilts 8.
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    expect(css).toContain(".maya.state-worried .maya-brow-l { transform: rotate(-12deg); }");
    expect(css).toContain(".maya.state-warning .maya-brow-l { transform: translateY(-1.5px) rotate(-8deg); }");
    const [left, right] = f.brows.split("/>").filter(Boolean).reduce<[string, string]>(
      (acc, el, i) => {
        acc[i % 2] += `${el}/>`;
        return acc;
      },
      ["", ""]
    );
    for (const [markup, centre, sign] of [
      [left, [87.5, 90], 1],
      [right, [112.5, 90], -1]
    ] as const) {
      for (const [deg, dy] of [[0, 0], [-12 * sign, 0], [12 * sign, 0], [-8 * sign, -1.5]]) {
        const b = bbox(markup, rotateAbout(centre as unknown as Pt, deg, dy));
        expect(inside(b, FEATURE_BOXES.brows), `brow at ${deg} deg: ${b.map((v) => v.toFixed(1))}`).toBe(true);
      }
    }
  });

  it("puts no ringlet's centre within 1.2x the face oval (an independent check)", () => {
    const { ringlets } = allCurlCentres();
    expect(ringlets.length).toBeGreaterThan(100);
    for (const [x, y] of ringlets) expect(((x - 100) / 36.6) ** 2 + ((y - 106) / 51.6) ** 2, `${x.toFixed(1)},${y.toFixed(1)}`).toBeGreaterThan(1);
  });

  it("never draws a curl over a feature box (every stroke, at its width)", () => {
    const curls = frontCurls(hudFigureSvg(139, 136));
    // Most of the front ringlets and the fringe are drawn; a few are left out to keep the face clear.
    expect(curls.length).toBeGreaterThan(110);
    for (const { pts, w } of curls) {
      for (const [x, y] of pts) {
        for (const [name, [x1, y1, x2, y2]] of Object.entries(FEATURE_BOXES)) {
          const touches = x + w / 2 > x1 && x - w / 2 < x2 && y + w / 2 > y1 && y - w / 2 < y2;
          expect(touches, `curl at ${x.toFixed(1)},${y.toFixed(1)} over the ${name}`).toBe(false);
        }
      }
    }
  });

  it("is seeded: the same curls on every call, so she never shimmers or re-scatters", () => {
    const strip = (svg: string) => svg.replace(/maya-hud-crop-\d+/g, "crop");
    expect(strip(hudFigureSvg(139, 136))).toBe(strip(hudFigureSvg(139, 136)));
    expect(fullFigureSvg({ pack: true, width: 200, height: 490 })).toBe(fullFigureSvg({ pack: true, width: 200, height: 490 }));
    expect(fullFigureUrl({ pack: true })).toBe(fullFigureUrl({ pack: true }));
  });
});

describe("Maya's HUD figure", () => {
  it("keeps every hook her states animate", () => {
    const svg = hudFigureSvg(139, 136);
    for (const cls of ["maya-body", "maya-torso", "maya-head", "maya-eyes", "maya-brow-l", "maya-brow-r", "maya-mouth-smile", "maya-mouth-o", "maya-mouth-worry", "maya-arm-l", "maya-arm-r", "maya-sweat", "maya-bulb", "maya-alert", "maya-stars"]) {
      expect(svg, cls).toContain(cls);
    }
  });

  it("keeps every gesture inside her box: each arm, at every rotation a state gives it in panjim.css", () => {
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    const rotations: Record<"l" | "r", number[]> = { l: [0], r: [0] };
    for (const m of css.matchAll(/\.maya\.state-\w+ \.maya-arm-(l|r) \{[^}]*?transform: rotate\((-?\d+)deg\)/g)) rotations[m[1] as "l" | "r"].push(Number(m[2]));
    const wave = /@keyframes maya-wave \{([\s\S]*?)\n\}/.exec(css)![1];
    for (const m of wave.matchAll(/rotate\((-?\d+)deg\)/g)) rotations.r.push(Number(m[1]));
    expect(rotations.r.length).toBeGreaterThan(5);
    const { x, y, width, height } = HUD_VIEWBOX;
    for (const side of ["l", "r"] as const) {
      const { pivot, reach } = HUD_ARMS[side];
      for (const deg of rotations[side]) {
        for (const [px, py] of reach) {
          const scaled: Pt = [pivot[0] + (px - pivot[0]) * HUD_FOREARM, pivot[1] + (py - pivot[1]) * HUD_FOREARM];
          const [rx, ry] = rotateAbout(pivot, deg)(scaled);
          if (ry > y + height) continue; // below the crop: clipped, never seen
          expect(rx, `${side} arm at ${deg} deg`).toBeGreaterThanOrEqual(x);
          expect(rx, `${side} arm at ${deg} deg`).toBeLessThanOrEqual(x + width);
          expect(ry, `${side} arm at ${deg} deg`).toBeGreaterThanOrEqual(y);
        }
      }
    }
  });

  it("gives every figure on a page its own clip", () => {
    const ids = [hudFigureSvg(139, 136), hudFigureSvg(139, 136)].map((svg) => /clipPath id="([^"]+)"/.exec(svg)![1]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("is sized in the CSS to its crop's shape", () => {
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    const box = /\.maya-figure-wrap \{[^}]*?width: (\d+)px;\s*height: (\d+)px;/.exec(css)!;
    expect(Number(box[1]) / Number(box[2])).toBeCloseTo(HUD_VIEWBOX.width / HUD_VIEWBOX.height, 1);
  });
});

describe("Maya's full figure", () => {
  it("wears the pack only in the variant that asks for it", () => {
    const pack = MAYA_PALETTE.pack;
    expect(fullFigureSvg({ pack: true, width: 200, height: 490 })).toContain(pack);
    expect(fullFigureSvg({ pack: false, width: 200, height: 490 })).not.toContain(pack);
    expect(hudFigureSvg(139, 136)).not.toContain("var(--maya-pack)");
  });

  it("holds the binoculars in one hand: two brass lens rims, drawn before the fist", () => {
    const svg = fullFigureSvg({ pack: true, width: 200, height: 490 });
    expect(svg.split(MAYA_PALETTE["lens-rim"]).length - 1).toBe(2);
    expect(svg.lastIndexOf(MAYA_PALETTE["lens-rim"])).toBeLessThan(svg.indexOf('stroke-width="3.2"'));
  });
});

describe("Maya's palette", () => {
  it("is defined once: no colour literal in the art outside the palette table", () => {
    const source = readFileSync("src/ui/panjim/mayaArt.ts", "utf8");
    const table = source.slice(source.indexOf("export const MAYA_PALETTE"), source.indexOf("} as const;"));
    expect(source.replace(table, "").match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).toEqual([]);
  });

  it("carries the brief's colours, read by the live figure as CSS custom properties", () => {
    expect(MAYA_PALETTE.skin).toBe("#c98f68");
    expect(MAYA_PALETTE.shirt).toBe("#2f7d6e");
    expect(MAYA_PALETTE["hair-base"]).toBe("#33200f");
    expect(MAYA_PALETTE["lens-rim"]).toBe("#d8b45c");
    expect(paletteStyle()).toContain("--maya-shirt:#2f7d6e");
    expect(hudFigureSvg(139, 136)).toContain("var(--maya-shirt)");
  });
});
