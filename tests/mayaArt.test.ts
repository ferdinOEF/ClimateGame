import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allCurlCentres,
  FEATURE_BOXES,
  featureMarkup,
  fullFigureSvg,
  fullFigureUrl,
  HUD_ARMS,
  HUD_UNIT_PX,
  handMarkup,
  HUD_VIEWBOX,
  headUrl,
  hudFigureSvg,
  MAYA_PALETTE,
  paletteStyle
} from "../src/ui/panjim/mayaArt";
import { figureSize, MAYA_SCALE } from "../src/ui/panjim/mayaLayout";

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

  /** Every pose the CSS gives an arm: its rotation and how much it is shortened about the shoulder (1 = full length). */
  function armPoses(): Record<"l" | "r", { deg: number; k: number }[]> {
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    const poses: Record<"l" | "r", { deg: number; k: number }[]> = { l: [{ deg: 0, k: 1 }], r: [{ deg: 0, k: 1 }] };
    for (const m of css.matchAll(/\.maya\.state-\w+ \.maya-arm-(l|r) \{[^}]*?transform: rotate\((-?\d+)deg\) scale\(([\d.]+)\)/g)) {
      poses[m[1] as "l" | "r"].push({ deg: Number(m[2]), k: Number(m[3]) });
    }
    const wave = /@keyframes maya-wave \{([\s\S]*?)\n\}/.exec(css)![1];
    for (const m of wave.matchAll(/rotate\((-?\d+)deg\) scale\(([\d.]+)\)/g)) poses.r.push({ deg: Number(m[1]), k: Number(m[2]) });
    return poses;
  }
  const posed = (side: "l" | "r", [px, py]: Pt, { deg, k }: { deg: number; k: number }): Pt => {
    const { pivot } = HUD_ARMS[side];
    return rotateAbout(pivot, deg)([pivot[0] + (px - pivot[0]) * k, pivot[1] + (py - pivot[1]) * k]);
  };

  it("keeps every gesture inside her box: each arm, in every pose a state gives it in panjim.css", () => {
    const poses = armPoses();
    // 1 at rest, then: wave (3), tip, explains, warning, worried (2), celebrates.
    expect(poses.r.length).toBeGreaterThan(8);
    expect(poses.l.length).toBeGreaterThanOrEqual(2);
    const { x, y, width, height } = HUD_VIEWBOX;
    for (const side of ["l", "r"] as const) {
      for (const pose of poses[side]) {
        for (const pt of HUD_ARMS[side].reach) {
          const [rx, ry] = posed(side, pt, pose);
          const label = `${side} arm at ${pose.deg} deg, ${pose.k} long`;
          expect(rx, label).toBeGreaterThanOrEqual(x);
          expect(rx, label).toBeLessThanOrEqual(x + width);
          expect(ry, label).toBeGreaterThanOrEqual(y);
          expect(ry, label).toBeLessThanOrEqual(y + height);
        }
      }
    }
  });

  it("never puts a hand or the binoculars through her face", () => {
    // The arm's centre line, shoulder to hand, in every pose; her face oval widened by the arm's half width (and the hand's).
    const hands = { l: [53, 304] as Pt, r: [148, 303] as Pt };
    const WIDEN = 9;
    for (const side of ["l", "r"] as const) {
      for (const pose of armPoses()[side]) {
        const [ex, ey] = posed(side, hands[side], pose);
        const [sx, sy] = HUD_ARMS[side].pivot;
        for (let i = 0; i <= 20; i++) {
          const x = sx + ((ex - sx) * i) / 20;
          const y = sy + ((ey - sy) * i) / 20;
          const inFace = ((x - 100) / (30.5 + WIDEN)) ** 2 + ((y - 106) / (43 + WIDEN)) ** 2 < 1;
          expect(inFace, `${side} arm at ${pose.deg} deg, ${pose.k} long, ${x.toFixed(0)},${y.toFixed(0)}`).toBe(false);
        }
      }
    }
  });

  it("leaves the binoculars hand at rest in every state that raises or points an arm", () => {
    // Her gestures use the other arm: the binoculars arm only ever draws in toward her.
    for (const pose of armPoses().l) expect(Math.abs(pose.deg)).toBeLessThanOrEqual(14);
  });

  it("has hands that fit inside the points the gestures are checked with", () => {
    const hands = handMarkup();
    for (const side of ["l", "r"] as const) {
      const b = bbox(hands[side]);
      const xs = HUD_ARMS[side].reach.map((p) => p[0]);
      const ys = HUD_ARMS[side].reach.map((p) => p[1]);
      expect(b[0], `${side} hand left`).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(b[2], `${side} hand right`).toBeLessThanOrEqual(Math.max(...xs));
      expect(b[3], `${side} hand bottom`).toBeLessThanOrEqual(Math.max(...ys));
    }
  });

  it("draws her legs and boots inside the crop, behind the torso, in the body group", () => {
    const svg = hudFigureSvg(97, 268);
    const legs = svg.indexOf('class="maya-legs"');
    expect(legs).toBeGreaterThan(svg.indexOf('class="maya-body"'));
    expect(legs).toBeLessThan(svg.indexOf('class="maya-torso"'));
    const boots = bbox(fullFigureSvg({ pack: false, width: 200, height: 490 }).match(/<path d="M70 438[^>]*>/)![0]);
    expect(boots[3]).toBeLessThan(HUD_VIEWBOX.y + HUD_VIEWBOX.height);
    expect(hudFigureSvg(97, 268)).not.toContain("var(--maya-pack)");
  });

  it("gives every figure on a page its own clip", () => {
    const ids = [hudFigureSvg(139, 136), hudFigureSvg(139, 136)].map((svg) => /clipPath id="([^"]+)"/.exec(svg)![1]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("is sized from her crop's shape and the one scale, in the CSS and in the code", () => {
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    const box = figureSize(HUD_VIEWBOX, HUD_UNIT_PX);
    expect(box.w / box.h).toBeCloseTo(HUD_VIEWBOX.width / HUD_VIEWBOX.height, 2);
    // Her drawing keeps the size it always had in the HUD (139 px for a 158-unit crop), times MAYA_SCALE.
    expect(HUD_UNIT_PX * 158).toBeCloseTo(139, 5);
    expect(box.w).toBe(Math.round(HUD_VIEWBOX.width * HUD_UNIT_PX * MAYA_SCALE));
    // The CSS takes the box from the variables maya.ts sets from it, and every tier scales width and height together.
    expect(css).toMatch(/\.maya-figure-wrap \{[^}]*?width: calc\(var\(--maya-fig-w\) \* var\(--maya-tier\)\);\s*height: calc\(var\(--maya-fig-h\) \* var\(--maya-tier\)\);/);
    expect(css).not.toMatch(/\.maya-figure-wrap \{[^}]*?width: \d+px/);
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

describe("Maya's chin", () => {
  const svg = fullFigureSvg({ pack: false, width: 200, height: 490, paint: "literal" });
  const OLD = "C70.5 118 78 137 100 148";

  it("is the rounder one in both face paths, in the full figure, the HUD and the badge, and the old point is gone", () => {
    for (const markup of [svg, hudFigureSvg(97, 268), headUrl()]) {
      const text = decodeURIComponent(markup);
      expect(text).not.toContain(OLD);
      expect(text).toContain("C70.5 120 83 141 100 146 C117 141 129.5 120 130 100");
    }
    expect(svg).toContain("C70.5 120 83 141 100 146 C94 133 88 117 88 100");
    expect(readFileSync("docs/design/maya_field_researcher_reference.html", "utf8")).not.toContain(OLD);
  });

  it("holds the jaw shadow inside it", () => {
    // The face outline, sampled: M100 63 C74 63 69.5 80 70 100 C70.5 120 83 141 100 146 C117 141 129.5 120 130 100 C130.5 80 126 63 100 63.
    const cubic = (p: Pt[], n = 40): Pt[] =>
      Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n;
        const u = 1 - t;
        const f = (k: 0 | 1) => u ** 3 * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t ** 3 * p[3][k];
        return [f(0), f(1)] as Pt;
      });
    const outline = [
      ...cubic([[100, 63], [74, 63], [69.5, 80], [70, 100]]),
      ...cubic([[70, 100], [70.5, 120], [83, 141], [100, 146]]),
      ...cubic([[100, 146], [117, 141], [129.5, 120], [130, 100]]),
      ...cubic([[130, 100], [130.5, 80], [126, 63], [100, 63]])
    ];
    const within = ([x, y]: Pt): boolean => {
      let c = false;
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const [xi, yi] = outline[i];
        const [xj, yj] = outline[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    // The jaw-shadow crescent: M87 134 q13 8 26 0 q-13 10 -26 0z, sampled along both curves.
    const quad = (a: Pt, c: Pt, b: Pt): Pt[] => Array.from({ length: 21 }, (_, i) => { const t = i / 20; const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]] as Pt; });
    expect(svg).toContain("M87 134 q13 8 26 0 q-13 10 -26 0z");
    for (const pt of [...quad([87, 134], [100, 142], [113, 134]), ...quad([113, 134], [100, 144], [87, 134])]) expect(within(pt), `${pt}`).toBe(true);
    // And the chin-line stroke under the mouth.
    for (const pt of quad([92, 129], [100, 130.8], [108, 129])) expect(within(pt), `${pt}`).toBe(true);
  });
});
