/**
 * Maya's artwork: a young Goan field researcher with shoulder-length curly
 * hair, a teal field shirt, olive cargo trousers, boots, a daypack and
 * binoculars. An original stylised character, not a likeness of anyone.
 *
 * A port of the approved reference, docs/design/maya_field_researcher_reference.html,
 * keeping its construction: the coil (ringlet) generator, the hair
 * silhouette, the face path, the garment paths and the hand builders. Drawn
 * in a 200-wide viewBox: face y63-146, shoulders ~y172, waist ~y240, hips
 * ~y282, boots ending ~y470.
 *
 * Everything is seeded: the same curls on every load, in every state, on
 * every frame. Nothing here animates; maya.ts and panjim.css move the groups
 * this file names (maya-head, maya-eyes, maya-brow-l/-r, maya-mouth-*,
 * maya-arm-l/-r, maya-torso, maya-body) exactly as they moved the old art.
 *
 * Colours are named tokens in one table (`MAYA_PALETTE`). A live SVG reads
 * them as CSS custom properties set on its root; a pre-rendered sprite (an
 * `<img>`, which cannot see the page's CSS) gets the same values inlined.
 * Either way one edit to the table recolours the whole character.
 */

/** Maya's colours, by name. The teal shirt is deliberate: no hue like it appears on the Panjim map. */
export const MAYA_PALETTE = {
  skin: "#c98f68",
  "skin-shadow": "#ab7551",
  "skin-deep": "#92603f",
  hands: "#dda882",
  "hair-base": "#33200f",
  "hair-mid": "#6b4324",
  "hair-light": "#a1703f",
  "hair-tip": "#c08e55",
  shirt: "#2f7d6e",
  "shirt-shade": "#24655a",
  "shirt-dark": "#1b4f46",
  "shirt-light": "#3d9183",
  trousers: "#6f6a3a",
  "trouser-shade": "#5a5630",
  "trouser-dark": "#494526",
  belt: "#523521",
  "belt-shade": "#3d2718",
  buckle: "#c9a24a",
  pack: "#4f5a33",
  "pack-shade": "#3f4828",
  strap: "#6b5a33",
  "strap-shade": "#52452a",
  boot: "#6b4428",
  "boot-shade": "#523321",
  sole: "#3c2617",
  binoculars: "#46574a",
  "binocular-shade": "#374638",
  "binocular-light": "#5c7060",
  lens: "#9fd3e4",
  "lens-rim": "#d8b45c",
  cheek: "#d4836c",
  mouth: "#9c4f45",
  "lip-highlight": "#c47b6c",
  vial: "#8fd3e8",
  "vial-cap": "#d9533f",
  "vial-water": "#6fb9d2",
  notebook: "#efe3c6",
  "eye-white": "#ffffff",
  iris: "#45291a",
  pupil: "#1d120a",
  lash: "#2c1a0f",
  brow: "#36220f",
  "eye-closed": "#3a2214",
  tongue: "#c4756a",
  // The state badges and props (unchanged colours from the earlier art).
  "bulb": "#ffd54a",
  "bulb-edge": "#c99a1b",
  "bulb-base": "#9b9b8f",
  alert: "#e0533a",
  "alert-mark": "#fdf6e6",
  star: "#f2c35b",
  "star-edge": "#a8781b",
  sweat: "#8fd0f0"
} as const;

type MayaToken = keyof typeof MAYA_PALETTE;

/** How a token becomes a colour: a CSS variable (live) or its hex (a sprite). */
type Paint = (token: MayaToken) => string;
const live: Paint = (token) => `var(--maya-${token})`;
const literal: Paint = (token) => MAYA_PALETTE[token];

/** The root style that defines every token as a CSS custom property. */
export function paletteStyle(): string {
  return Object.entries(MAYA_PALETTE)
    .map(([name, value]) => `--maya-${name}:${value}`)
    .join(";");
}

/** The reference's seeded generator (Park-Miller), so the curls never re-scatter. */
const rnd = (seed: number): (() => number) => {
  let x = seed;
  return () => {
    x = (x * 48271) % 2147483647;
    return (x - 1) / 2147483646;
  };
};

const FACE = { cx: 100, cy: 106, rx: 30.5, ry: 43 };
/** The seeds of the reference: the ringlets behind the face and those in front of the shoulders. */
const BACK_SEED = 17;
const FRONT_SEED = 41;

/**
 * One coiled ringlet: a spiral walked through `turns` turns, radius shrinking
 * to about half, squashed vertically, drifting down as it coils, and rotated
 * to an angle set by its phase (the rotation is baked into the points).
 */
function coilPoints(cx: number, cy: number, r0: number, turns: number, phase: number, squash: number): [number, number][] {
  const N = Math.round(turns * 16);
  const rot = ((((phase * 57.3) % 180) - 90) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * turns * Math.PI * 2;
    const r = r0 * (1 - 0.52 * (i / N));
    const dx = Math.cos(t + phase) * r;
    const dy = Math.sin(t + phase) * r * squash + (i / N) * r0 * 0.55;
    pts.push([cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]);
  }
  return pts;
}

function polyline(pts: [number, number][], paint: Paint, col: MayaToken, w: number, op: number | null): string {
  return `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="none" stroke="${paint(col)}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${op ? ` opacity="${op}"` : ""}/>`;
}

/**
 * The face's features, as boxes in the 200-wide viewBox: brows (every
 * expression), eyes, nose and mouth. No curl drawn in front of the face may
 * touch one (`clearOfFeatures`), so the expression always reads.
 */
export const FEATURE_BOXES: Record<string, [number, number, number, number]> = {
  brows: [75, 82.5, 125, 95.5],
  eyes: [75, 93, 125, 113],
  nose: [92, 102, 107, 118],
  mouth: [87, 120, 113, 137]
};

/** True when a stroke of width `w` along `pts` stays clear of every feature box. */
function clearOfFeatures(pts: [number, number][], w: number): boolean {
  const h = w / 2;
  for (const [x, y] of pts) {
    for (const [x1, y1, x2, y2] of Object.values(FEATURE_BOXES)) if (x + h > x1 && x - h < x2 && y + h > y1 && y - h < y2) return false;
  }
  return true;
}

/** A ringlet drawn twice, thick in the base tone and thinner on top in a lighter one, so every coil has a lit edge; "" if it would cover a feature. */
function ringlet(paint: Paint, x: number, y: number, r0: number, base: { turns: number; phase: number; w: number }, lit: { r: number; turns: number; phase: number; w: number; col: MayaToken }, squash: number, guard: boolean): string {
  const under = coilPoints(x, y, r0, base.turns, base.phase, squash);
  const over = coilPoints(x, y, lit.r, lit.turns, lit.phase, squash);
  if (guard && (!clearOfFeatures(under, base.w) || !clearOfFeatures(over, lit.w))) return "";
  return polyline(under, paint, "hair-base", base.w, null) + polyline(over, paint, lit.col, lit.w, 0.92);
}

/** The hair mass: a rounded crown and two side masses ending at the shoulder. */
function inMass(x: number, y: number): boolean {
  const crown = ((x - 100) / 53) ** 2 + ((y - 84) / 47) ** 2 <= 1;
  const sides = Math.abs(x - 100) < 56 && y >= 74 && y <= 176 && Math.abs(x - 100) > 17 && ((x - 100) / (56 - (y - 74) * 0.05)) ** 2 < 1.5;
  return crown || sides;
}

/** How far round the face no ringlet's centre may fall: 1.2 times the face ellipse, both ways. */
export const FACE_CLEARANCE = 1.2;

/** True where a curl's centre would fall within FACE_CLEARANCE of the face oval. */
export function onFace(x: number, y: number): boolean {
  return ((x - FACE.cx) / (FACE.rx * FACE_CLEARANCE)) ** 2 + ((y - FACE.cy) / (FACE.ry * FACE_CLEARANCE)) ** 2 <= 1;
}

function hairSilhouette(paint: Paint): string {
  const f = paint("hair-base");
  return `<ellipse cx="100" cy="84" rx="53" ry="47" fill="${f}"/>
    <path d="M44 96 C38 126 38 156 46 176 C62 182 78 180 88 172 C78 150 76 120 80 100 Z" fill="${f}"/>
    <path d="M156 96 C162 126 162 156 154 176 C138 182 122 180 112 172 C122 150 124 120 120 100 Z" fill="${f}"/>
    <path d="M70 66 Q100 44 130 66 Q132 82 100 80 Q68 82 70 66 Z" fill="${f}"/>`;
}

/** The ringlet centres (the reference's spot search) and the generator, ready to draw each ringlet's size, tone and shape. */
function ringletSpots(seed: number, front: boolean): { spots: [number, number][]; R: () => number } {
  const R = rnd(seed);
  const spots: [number, number][] = [];
  for (let i = 0; i < 900 && spots.length < (front ? 46 : 82); i++) {
    const x = 100 + (R() * 2 - 1) * 64;
    const y = 56 + R() * 126;
    if (!inMass(x, y)) continue;
    if (onFace(x, y)) continue;
    if (spots.some((s) => Math.hypot(s[0] - x, s[1] - y) < (front ? 9 : 8))) continue;
    spots.push([x, y]);
  }
  return { spots, R };
}

/** Where every ringlet sits, behind and in front, and the fringe's curls: for the tests. */
export function allCurlCentres(): { ringlets: [number, number][]; fringe: [number, number][] } {
  return {
    ringlets: [...ringletSpots(BACK_SEED, false).spots, ...ringletSpots(FRONT_SEED, true).spots],
    fringe: fringeCurls().map((c) => [c.x, c.y])
  };
}

function ringlets(paint: Paint, seed: number, front: boolean): string {
  // The same draws, in the same order, as the reference: the spot search, then each ringlet's size, tone, squash, turns and phases.
  const { spots, R } = ringletSpots(seed, front);
  let out = "";
  for (const [x, y] of spots) {
    const edge = Math.abs(x - 100) > 44 || y > 150;
    const r0 = (edge ? 7.5 : 6.2) + R() * 4.2;
    const tone = R();
    const col: MayaToken = tone < 0.52 ? "hair-mid" : tone < 0.86 ? "hair-light" : "hair-tip";
    const sq = 0.52 + R() * 0.3;
    // The draws in the reference's order, whether or not the ringlet is drawn, so a skipped one never moves the rest.
    const baseTurns = 1.3 + R() * 0.8;
    const basePhase = R() * 6.28;
    const litTurns = 1.2 + R() * 0.75;
    const litPhase = R() * 6.28;
    out += ringlet(paint, x, y, r0, { turns: baseTurns, phase: basePhase, w: r0 * 0.74 }, { r: r0 * 0.9, turns: litTurns, phase: litPhase, w: r0 * 0.3, col }, sq, front);
  }
  return out;
}

/** Where the fringe sits: its row, the arch over the forehead, and the curls' size. */
const FRINGE = { y: 75, arch: 6, jitter: 3, r: 4.8, rSpread: 2.6 };

interface FringeCurl {
  x: number;
  y: number;
  r0: number;
  sq: number;
  basePhase: number;
  litPhase: number;
  col: MayaToken;
}

/** The fringe's curls, drawn from one seeded generator (the reference's draws, in its order). */
function fringeCurls(): FringeCurl[] {
  const R = rnd(5);
  const out: FringeCurl[] = [];
  for (let i = 0; i < 21; i++) {
    const t = i / 20;
    const x = 69 + t * 62;
    // Higher and a little smaller than the reference's (y 81, r 5.6-9): its lower coils reached the brows.
    const y = FRINGE.y + Math.sin(t * Math.PI) * -FRINGE.arch + R() * FRINGE.jitter;
    const r0 = FRINGE.r + R() * FRINGE.rSpread;
    const sq = 0.55 + R() * 0.25;
    const basePhase = R() * 6.28;
    const litPhase = R() * 6.28;
    const col: MayaToken = R() < 0.6 ? "hair-mid" : "hair-light";
    out.push({ x, y, r0, sq, basePhase, litPhase, col });
  }
  return out;
}

/** Curly bangs across the forehead, stopping above the brows. */
function fringe(paint: Paint): string {
  return fringeCurls()
    .map(({ x, y, r0, sq, basePhase, litPhase, col }) => ringlet(paint, x, y, r0, { turns: 1.3, phase: basePhase, w: r0 * 0.8 }, { r: r0 * 0.88, turns: 1.2, phase: litPhase, w: r0 * 0.3, col }, sq, true))
    .join("");
}

export type MayaExpression = "greet" | "warn" | "alarm" | "happy";

function eyes(paint: Paint, kind: MayaExpression): string {
  const w = paint("eye-white");
  const iris = paint("iris");
  const pupil = paint("pupil");
  if (kind === "happy") {
    const c = paint("eye-closed");
    return `<path d="M80 104 q7.5 -7.5 15 0" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M105 104 q7.5 -7.5 15 0" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
  const shape =
    kind === "alarm"
      ? `<ellipse cx="87.5" cy="103" rx="7.6" ry="8.8" fill="${w}"/><ellipse cx="112.5" cy="103" rx="7.6" ry="8.8" fill="${w}"/>`
      : kind === "warn"
        ? `<path d="M79.5 103 q8 -7.5 16 0 q-8 7.5 -16 0z" fill="${w}"/><path d="M104.5 103 q8 -7.5 16 0 q-8 7.5 -16 0z" fill="${w}"/>`
        : `<path d="M80 103 q7.5 -6.5 15 0 q-7.5 6.5 -15 0z" fill="${w}"/><path d="M105 103 q7.5 -6.5 15 0 q-7.5 6.5 -15 0z" fill="${w}"/>`;
  const cy = kind === "alarm" ? 103.6 : 103;
  const ir = kind === "warn" ? 4.6 : kind === "alarm" ? 4.4 : 4.3;
  const pr = kind === "warn" ? 2.1 : 2;
  const hy = kind === "alarm" ? 101.4 : kind === "warn" ? 101.2 : 101.3;
  const hr = kind === "greet" ? 1.5 : 1.6;
  const lash = paint("lash");
  return `${shape}
    <circle cx="87.5" cy="${cy}" r="${ir}" fill="${iris}"/><circle cx="112.5" cy="${cy}" r="${ir}" fill="${iris}"/>
    <circle cx="87.5" cy="${cy}" r="${pr}" fill="${pupil}"/><circle cx="112.5" cy="${cy}" r="${pr}" fill="${pupil}"/>
    <circle cx="89.1" cy="${hy}" r="${hr}" fill="${w}"/><circle cx="114.1" cy="${hy}" r="${hr}" fill="${w}"/>
    <path d="M79.6 101.4 l-3.2 -2.2" stroke="${lash}" stroke-width="2" stroke-linecap="round"/>
    <path d="M120.4 101.4 l3.2 -2.2" stroke="${lash}" stroke-width="2" stroke-linecap="round"/>`;
}

const BROWS: Record<MayaExpression, [string, string, number]> = {
  greet: ["M79.5 91.5 q8 -5 16 -1.5", "M104.5 90 q8 -3.5 16 1.5", 3],
  warn: ["M79.5 89 q8 -2 16 3", "M104.5 92 q8 -5 16 -3", 3.2],
  alarm: ["M79 87.5 q8.5 -1 16.5 4.5", "M104.5 92 q8 -5.5 16.5 -4.5", 3.3],
  happy: ["M79.5 89.5 q8 -5.5 16 -2", "M104.5 87.5 q8 -3.5 16 2", 3]
};

function mouth(paint: Paint, kind: MayaExpression): string {
  const m = paint("mouth");
  switch (kind) {
    case "greet":
      return `<path d="M92 125.5 q8 2.6 16 0 q-8 8 -16 0z" fill="${m}"/><path d="M94.6 126.8 q5.4 1.5 10.8 0" stroke="${paint("lip-highlight")}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
    case "warn":
      return `<path d="M93.5 125.5 q6.5 2 13 0 q-6.5 5.6 -13 0z" fill="${m}"/>`;
    case "alarm":
      return `<ellipse cx="100" cy="127.5" rx="5.6" ry="7" fill="${m}"/><ellipse cx="100" cy="130.7" rx="3.4" ry="2.6" fill="${paint("tongue")}"/>`;
    case "happy":
      return `<path d="M89.5 123 q10.5 12 21 0 q-10.5 4 -21 0z" fill="${m}"/><path d="M91.6 124.2 q8.4 1.8 16.8 0" stroke="${paint("eye-white")}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  }
}

/** The face's skin: the drawn oval, the shadow down one side, the jaw shadow, the cheeks. */
function faceSkin(paint: Paint): string {
  return `<path d="M100 63 C74 63 69.5 80 70 100 C70.5 120 83 141 100 146 C117 141 129.5 120 130 100 C130.5 80 126 63 100 63 Z" fill="${paint("skin")}"/>
    <path d="M100 63 C74 63 69.5 80 70 100 C70.5 120 83 141 100 146 C94 133 88 117 88 100 C88 82 92 70 100 63 Z" fill="${paint("skin-shadow")}" opacity=".30"/>
    <path d="M87 134 q13 8 26 0 q-13 10 -26 0z" fill="${paint("skin-shadow")}" opacity=".26"/>
    <ellipse cx="81.5" cy="114" rx="6.4" ry="4.4" fill="${paint("cheek")}" opacity=".38"/>
    <ellipse cx="118.5" cy="114" rx="6.4" ry="4.4" fill="${paint("cheek")}" opacity=".38"/>`;
}

function nose(paint: Paint): string {
  const d = paint("skin-deep");
  return `<path d="M99.2 104 q4 6.8 0.4 10.4 q-2 1.6 -4 0.4" stroke="${d}" stroke-width="2.1" fill="none" stroke-linecap="round" opacity=".75"/>
    <ellipse cx="96.6" cy="115.2" rx="1.2" ry="0.85" fill="${d}" opacity=".55"/>
    <ellipse cx="103.4" cy="115.2" rx="1.2" ry="0.85" fill="${d}" opacity=".55"/>`;
}

function chin(paint: Paint): string {
  return `<path d="M92 129 q8 1.8 16 0" stroke="${paint("skin-shadow")}" stroke-width="1.3" fill="none" opacity=".4"/>`;
}

function brows(paint: Paint, kind: MayaExpression, classed: boolean): string {
  const [l, r, w] = BROWS[kind];
  const s = paint("brow");
  return `<path${classed ? ' class="maya-brow-l"' : ""} d="${l}" stroke="${s}" stroke-width="${w}" fill="none" stroke-linecap="round"/>
    <path${classed ? ' class="maya-brow-r"' : ""} d="${r}" stroke="${s}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
}

/** The worried mouth (the HUD's frown). */
function worryMouth(paint: Paint): string {
  return `<path d="M92.5 130 q7.5 -5.5 15 0" stroke="${paint("mouth")}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
}

/** Every drawn face feature, in every expression, by the FEATURE_BOXES name that must contain it: for the tests. */
export function featureMarkup(): Record<"brows" | "eyes" | "nose" | "mouth", string> {
  const kinds: MayaExpression[] = ["greet", "warn", "alarm", "happy"];
  return {
    brows: kinds.map((k) => brows(literal, k, false)).join(""),
    eyes: kinds.map((k) => eyes(literal, k)).join(""),
    nose: nose(literal),
    mouth: kinds.map((k) => mouth(literal, k)).join("") + worryMouth(literal)
  };
}

/** A face with one fixed expression (the full figures). */
function face(paint: Paint, kind: MayaExpression): string {
  return `${faceSkin(paint)}${brows(paint, kind, false)}${eyes(paint, kind)}${nose(paint)}${mouth(paint, kind)}${chin(paint)}`;
}

/**
 * The HUD face: every expression the states need, each in the group the CSS
 * shows or hides (the old art's hooks: maya-brows, maya-eyes, maya-mouth-smile,
 * -o, -worry), plus happy eyes and mouth for a celebration and wide eyes for a
 * warning.
 */
function stateFace(paint: Paint): string {
  return `${faceSkin(paint)}
    <g class="maya-brows">${brows(paint, "greet", true)}</g>
    <g class="maya-eyes">${eyes(paint, "greet")}</g>
    <g class="maya-eyes-wide">${eyes(paint, "alarm")}</g>
    <g class="maya-eyes-happy">${eyes(paint, "happy")}</g>
    ${nose(paint)}
    <g class="maya-mouth maya-mouth-smile">${mouth(paint, "greet")}</g>
    <g class="maya-mouth maya-mouth-o">${mouth(paint, "alarm")}</g>
    <g class="maya-mouth maya-mouth-worry">${worryMouth(paint)}</g>
    <g class="maya-mouth maya-mouth-happy">${mouth(paint, "happy")}</g>
    ${chin(paint)}`;
}

// ---- hands ------------------------------------------------------------------

/** An open hand: palm, four tapered fingers with a slight splay and curl, the thumb set off to one side, a crease. dir -1: thumb to the left. */
function handOpen(paint: Paint, x: number, y: number, dir: number): string {
  const lt = paint("hands");
  const sh = paint("skin-shadow");
  let s = `<path d="M${x - 6} ${y - 7} q6 -3 12 0 q2 9 0 14 q-6 3 -12 0 q-2 -5 0 -14z" fill="${lt}"/>`;
  const fx = [-4.2, -1.4, 1.4, 4.2];
  const fl = [8.4, 9.6, 9.2, 7.6];
  for (let i = 0; i < 4; i++) {
    const d = `M${x + fx[i]} ${y + 5} q${(fx[i] * 0.25).toFixed(2)} ${(fl[i] * 0.6).toFixed(2)} ${(fx[i] * 0.3).toFixed(2)} ${fl[i]}`;
    s += `<path d="${d}" stroke="${lt}" stroke-width="3.3" fill="none" stroke-linecap="round"/>`;
    s += `<path d="${d}" stroke="${sh}" stroke-width="0.8" fill="none" stroke-linecap="round" opacity=".45"/>`;
  }
  s += `<path d="M${x + dir * 6} ${y - 2} q${dir * 5} 3 ${dir * 5} 8" stroke="${lt}" stroke-width="3.8" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M${x - 5} ${y + 4.5} q5 2 10 0" stroke="${sh}" stroke-width="0.9" fill="none" opacity=".5"/>`;
  return s;
}

/** A closed hand: a fist with four finger ridges wrapped across it and the thumb folded over the front. */
function handGrip(paint: Paint, x: number, y: number): string {
  const lt = paint("hands");
  const sh = paint("skin-shadow");
  let s = `<path d="M${x - 8} ${y - 8} q8 -3 16 0 q3 11 0 19 q-8 3 -16 0 q-3 -8 0 -19z" fill="${lt}"/>`;
  for (let i = 0; i < 4; i++) {
    const fy = y - 4.5 + i * 4.6;
    s += `<path d="M${x - 7.4} ${fy.toFixed(1)} q7.4 -2.4 14.8 0" stroke="${paint("skin")}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M${x - 7.4} ${(fy + 1.9).toFixed(1)} q7.4 -2.4 14.8 0" stroke="${sh}" stroke-width="0.9" fill="none" opacity=".5"/>`;
  }
  s += `<path d="M${x - 8.5} ${y - 4} q-4.5 5 -2.5 11.5 q3.5 3.5 6 0" fill="${lt}"/>`;
  s += `<path d="M${x - 8.5} ${y - 4} q-4.5 5 -2.5 11.5" stroke="${sh}" stroke-width="1" fill="none" opacity=".5"/>`;
  return s;
}

/** Binoculars hanging from the fist: strap loop, two barrels with eyepieces, focus rings, brass-rimmed lenses, the bridge. Drawn before the fist. */
function binoculars(paint: Paint, x: number, y: number): string {
  let s = `<path d="M${x - 3} ${y - 16} q3 -4 6 0" stroke="${paint("binocular-shade")}" stroke-width="2.6" fill="none"/>`;
  for (const [bx, col] of [
    [-6.5, "binocular-shade"],
    [6.5, "binoculars"]
  ] as const) {
    s += `<rect x="${x + bx - 5.5}" y="${y - 10}" width="11" height="9" rx="2.5" fill="${paint(col)}"/>`;
    s += `<rect x="${x + bx - 7}" y="${y - 2}" width="14" height="24" rx="4" fill="${paint(col)}"/>`;
    s += `<rect x="${x + bx - 7}" y="${y + 7}" width="14" height="4.5" rx="1.5" fill="${paint("binocular-light")}"/>`;
    s += `<ellipse cx="${x + bx}" cy="${y + 22}" rx="6.6" ry="2.8" fill="${paint("lens-rim")}"/>`;
    s += `<ellipse cx="${x + bx}" cy="${y + 22}" rx="4.6" ry="1.9" fill="${paint("lens")}"/>`;
  }
  s += `<rect x="${x - 3}" y="${y - 4}" width="6" height="12" rx="2" fill="${paint("binocular-light")}"/>`;
  return s;
}

function limb(d: string, w: number, col: string): string {
  return `<path d="${d}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
}

// ---- kit ----------------------------------------------------------------------

/** The daypack behind her, its body showing at both sides. */
function pack(paint: Paint): string {
  return `<path d="M60 186 C40 196 36 240 41 284 C50 296 70 296 80 286 C76 240 76 204 84 190 Z" fill="${paint("pack-shade")}"/>
    <path d="M140 186 C160 196 164 240 159 284 C150 296 130 296 120 286 C124 240 124 204 116 190 Z" fill="${paint("pack")}"/>
    <path d="M150 212 q10 3 10 22 q0 20 -10 22" fill="none" stroke="${paint("pack-shade")}" stroke-width="3.4"/>
    <path d="M44 214 q-8 3 -8 20 q0 18 8 20" fill="none" stroke="${paint("pack")}" stroke-width="3" opacity=".8"/>
    <path d="M126 206 h28 v9 h-28z" fill="${paint("pack-shade")}" opacity=".9"/>`;
}

/** Padded shoulder straps over the shirt and a chest strap with buckles. */
function straps(paint: Paint): string {
  let s = "";
  for (const [x0, x1, col] of [
    [80, 88, "strap-shade"],
    [120, 112, "strap"]
  ] as const) {
    s += `<path d="M${x0} 170 C${x0 - 4} 200 ${x1 - 2} 226 ${x1} 252" stroke="${paint(col)}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    s += `<rect x="${Math.min(x0, x1) - 5}" y="214" width="10" height="7" rx="1.5" fill="${paint("belt-shade")}"/>`;
  }
  s += `<path d="M88 214 q12 4 24 0" stroke="${paint("strap-shade")}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  s += `<rect x="95" y="210" width="10" height="9" rx="2" fill="${paint("belt-shade")}"/>`;
  return s;
}

function legsAndBoots(paint: Paint): string {
  const pant = paint("trousers");
  const sh = paint("trouser-shade");
  const dk = paint("trouser-dark");
  let s = "";
  s += limb("M87 282 C83 320 82 350 83 376", 29, pant);
  s += limb("M113 282 C117 320 118 350 117 376", 29, pant);
  s += limb("M83 372 C82 402 82 428 84 446", 25, pant);
  s += limb("M117 372 C118 402 118 428 116 446", 25, pant);
  s += limb("M90 300 C86 332 85 354 86 374", 7, sh);
  s += limb("M87 382 C86 406 86 426 87 442", 5, sh);
  // The thigh's flap pocket and the hip pocket, and the seams at the knee.
  s += `<path d="M70 318 h17 q2 0 2 2 v24 q0 2 -2 2 h-17 q-2 0 -2 -2 v-24 q0 -2 2 -2z" fill="${sh}"/>`;
  s += `<path d="M68 318 h21 v6 h-21z" fill="${dk}"/>`;
  s += `<path d="M113 322 h16 v22 h-16z" fill="${sh}" opacity=".85"/>`;
  s += `<path d="M113 322 h16 v5 h-16z" fill="${dk}" opacity=".9"/>`;
  s += `<path d="M74 430 q10 4 20 0" stroke="${dk}" stroke-width="2.4" fill="none" opacity=".8"/>`;
  s += `<path d="M106 430 q10 4 20 0" stroke="${dk}" stroke-width="2.4" fill="none" opacity=".8"/>`;
  for (const x of [84, 116]) {
    s += `<path d="M${x - 14} 438 q14 -5 28 0 l0 18 q-14 7 -28 0z" fill="${paint("boot")}"/>`;
    s += `<path d="M${x - 14} 442 q14 6 28 0" stroke="${paint("boot-shade")}" stroke-width="2.6" fill="none"/>`;
    s += `<path d="M${x - 16} 454 q16 8 32 0 q3 12 -16 12 q-19 0 -16 -12z" fill="${paint("sole")}"/>`;
    s += `<path d="M${x - 9} 446 q9 4 18 0" stroke="${paint("boot-shade")}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  }
  // The notebook showing out of the thigh pocket.
  s += `<path d="M71 314 h11 v7 h-11z" fill="${paint("notebook")}"/>`;
  return s;
}

/** The arm that holds the binoculars (her right, on the viewer's left): the arm, then the binoculars, then the fist over their top. */
function armLimbL(paint: Paint): string {
  return `${limb("M72 186 C58 222 52 258 53 296", 17, paint("skin"))}
    ${limb("M70 198 C58 230 53 258 54 290", 6, paint("skin-shadow"))}
    ${binoculars(paint, 53, 324)}${handGrip(paint, 52, 304)}`;
}

function sleeveL(paint: Paint): string {
  return `<path d="M72 172 C62 188 58 204 58 218 q12 6 24 0 C80 202 80 186 85 174 Z" fill="${paint("shirt-shade")}"/>
    <path d="M58 214 q12 7 24 0 l0 7 q-12 7 -24 0z" fill="${paint("shirt-dark")}"/>`;
}

/** The free arm (her left, on the viewer's right): every point and wave uses this one. */
function armLimbR(paint: Paint): string {
  return `${limb("M128 186 C142 222 148 258 147 296", 17, paint("skin"))}${handOpen(paint, 148, 303, 1)}`;
}

function sleeveR(paint: Paint): string {
  return `<path d="M128 172 C138 188 142 204 142 218 q-12 6 -24 0 C120 202 120 186 115 174 Z" fill="${paint("shirt")}"/>
    <path d="M118 214 q12 7 24 0 l0 7 q-12 7 -24 0z" fill="${paint("shirt-dark")}" opacity=".8"/>`;
}

/** Neck, shirt, collar, placket with brass buttons, flap chest pockets. */
function torsoUpper(paint: Paint): string {
  let s = "";
  s += `<path d="M91 144 h18 v28 h-18z" fill="${paint("skin-shadow")}"/>`;
  s += `<path d="M91 144 h18 v10 q-9 7 -18 0z" fill="${paint("skin-deep")}" opacity=".5"/>`;
  s += `<path d="M100 166 C84 167 70 175 66 187 C62 206 62 228 68 254 C84 262 116 262 132 254 C138 228 138 206 134 187 C130 175 116 167 100 166 Z" fill="${paint("shirt")}"/>`;
  s += `<path d="M100 166 C84 167 70 175 66 187 C62 206 62 228 68 254 C76 258 84 260 92 261 C84 226 84 192 94 170 Z" fill="${paint("shirt-shade")}" opacity=".85"/>`;
  s += `<path d="M91 164 L100 184 L109 164 Z" fill="${paint("skin-shadow")}"/>`;
  s += `<path d="M91 164 L100 184 L92 186 L83 170 Z" fill="${paint("shirt-dark")}"/>`;
  s += `<path d="M109 164 L100 184 L108 186 L117 170 Z" fill="${paint("shirt-light")}"/>`;
  s += `<path d="M100 182 v70" stroke="${paint("shirt-dark")}" stroke-width="2.2" fill="none"/>`;
  for (const y of [196, 212, 228, 244]) s += `<circle cx="100" cy="${y}" r="1.9" fill="${paint("buckle")}" opacity=".85"/>`;
  for (const x of [78, 110]) {
    s += `<path d="M${x} 196 h14 v16 h-14z" fill="${paint("shirt-shade")}"/>`;
    s += `<path d="M${x - 1} 194 h16 v6 q-8 3 -16 0z" fill="${paint("shirt-dark")}"/>`;
  }
  return s;
}

/** The pack's straps (if worn), the belt and buckle, and the sample vial clipped at the hip. */
function torsoLower(paint: Paint, withPack: boolean): string {
  let s = withPack ? straps(paint) : "";
  s += `<path d="M68 250 q32 10 64 0 l0 13 q-32 10 -64 0z" fill="${paint("belt")}"/>`;
  s += `<path d="M68 258 q32 10 64 0" stroke="${paint("belt-shade")}" stroke-width="2" fill="none"/>`;
  s += `<rect x="93" y="252" width="14" height="11" rx="2" fill="${paint("buckle")}"/>`;
  s += `<rect x="97" y="255" width="6" height="5" rx="1" fill="${paint("belt-shade")}"/>`;
  s += `<rect x="70" y="258" width="9" height="22" rx="3" fill="${paint("vial")}" opacity=".9"/>`;
  s += `<rect x="70" y="256" width="9" height="5" rx="1.5" fill="${paint("vial-cap")}"/>`;
  s += `<rect x="70" y="270" width="9" height="10" rx="2" fill="${paint("vial-water")}" opacity=".9"/>`;
  return s;
}

/**
 * The whole figure, head to boots, in one fixed expression: the level
 * intro and the Aftermath. `pack` adds the daypack and its straps.
 */
export function fullFigureSvg(options: { pack: boolean; expression?: MayaExpression; width: number; height: number; paint?: "live" | "literal" }): string {
  const paint = options.paint === "live" ? live : literal;
  const expression = options.expression ?? "greet";
  // The reference's order: hair behind, face, pack, legs and boots, arms (binoculars before the fist), shirt, sleeves, straps and belt, hair in front.
  const body = `${hairSilhouette(paint)}${ringlets(paint, BACK_SEED, false)}${face(paint, expression)}${options.pack ? pack(paint) : ""}${legsAndBoots(paint)}${armLimbL(paint)}${armLimbR(paint)}${torsoUpper(paint)}${sleeveL(paint)}${sleeveR(paint)}${torsoLower(paint, options.pack)}${ringlets(paint, FRONT_SEED, true)}${fringe(paint)}`;
  const style = options.paint === "live" ? ` style="${paletteStyle()}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="maya-art maya-full" viewBox="0 0 200 490" width="${options.width}" height="${options.height}"${style} aria-hidden="true" focusable="false">${body}</svg>`;
}

/** An SVG as a data URL, escaping only what a URL in an HTML attribute needs. */
function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${svg.replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/"/g, "'").replace(/\s+/g, " ")}`;
}

const urls = new Map<string, string>();
function cachedUrl(key: string, make: () => string): string {
  let url = urls.get(key);
  if (!url) {
    url = svgUrl(make());
    urls.set(key, url);
  }
  return url;
}

/** The full figure as an image URL: one pre-rendered node instead of hundreds (nothing in it moves). Built once per variant. */
export function fullFigureUrl(options: { pack: boolean; expression?: MayaExpression }): string {
  return cachedUrl(`full:${options.pack}:${options.expression ?? "greet"}`, () => fullFigureSvg({ ...options, width: 200, height: 490, paint: "literal" }));
}

/** Just the head (hair and face), for the minimised badge: a small image, built once. */
export function headUrl(): string {
  return cachedUrl("head", () => {
    const paint = literal;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 30 120 120">${hairSilhouette(paint)}${ringlets(paint, BACK_SEED, false)}${face(paint, "greet")}${ringlets(paint, FRONT_SEED, true)}${fringe(paint)}</svg>`;
  });
}

/**
 * The HUD crop, in the art's units: her whole figure, head to boots (the
 * boots end near y466), wide enough that every gesture (an arm rotated, and
 * for the long reaches shortened, by a state in panjim.css) stays inside it
 * (tests/mayaArt.test.ts checks this against the CSS).
 */
export const HUD_VIEWBOX = { x: 28, y: 34, width: 168, height: 442 };

/** Pixels per art unit before MAYA_SCALE (mayaLayout.ts): the size her head and shoulders have always had in the HUD (139 px for a 158-unit crop; the crop is wider now, the drawing the same size). */
export const HUD_UNIT_PX = 139 / 158;

/**
 * The outer points of each hand (and the binoculars) at rest, with the arm
 * hanging at full length: what must stay inside the crop in every pose.
 */
export const HUD_ARMS = {
  l: { pivot: [72, 180] as [number, number], reach: [[39, 296], [67, 296], [67, 350], [39, 350]] as [number, number][] },
  r: { pivot: [128, 180] as [number, number], reach: [[140, 296], [161, 296], [161, 320], [140, 320]] as [number, number][] }
};

/** Her hands as drawn, for the test that HUD_ARMS encloses them: the binoculars and fist (left), the open hand (right). */
export function handMarkup(): { l: string; r: string } {
  return { l: `${binoculars(literal, 53, 324)}${handGrip(literal, 52, 304)}`, r: handOpen(literal, 148, 303, 1) };
}

/** The pieces of her HUD figure that never change, each drawn once as a picture: hair and legs behind, the shirt, the hair in front, and each arm. */
export type HudLayer = "back" | "torso" | "hair" | "armL" | "armR";

function hudLayerContent(layer: HudLayer, paint: Paint): string {
  switch (layer) {
    case "back":
      return `${hairSilhouette(paint)}${ringlets(paint, BACK_SEED, false)}${legsAndBoots(paint)}`;
    case "torso":
      return `${torsoUpper(paint)}${torsoLower(paint, false)}`;
    case "hair":
      return `${ringlets(paint, FRONT_SEED, true)}${fringe(paint)}`;
    case "armL":
      return `${armLimbL(paint)}${sleeveL(paint)}`;
    case "armR":
      return `${armLimbR(paint)}${sleeveR(paint)}`;
  }
}

/**
 * A soft shadow under what a layer draws, baked into its picture: she lifts
 * off the map the way the old `filter: drop-shadow` made her, but nothing is
 * filtered while she animates (a filter on a figure that moves is redone every
 * frame).
 */
const LAYER_SHADOW = `<defs><filter id="s" x="-15%" y="-8%" width="130%" height="116%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="3.2"/><feOffset dy="5" result="o"/><feComponentTransfer in="o" result="c"><feFuncA type="linear" slope=".35"/></feComponentTransfer><feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

/** One static layer as a picture (literal colours, the HUD crop's viewBox, the shadow baked in). */
export function hudLayerSvg(layer: HudLayer): string {
  const { x, y, width: w, height: h } = HUD_VIEWBOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">${LAYER_SHADOW}<g filter="url(#s)">${hudLayerContent(layer, literal)}</g></svg>`;
}

/** The same, as an image URL, built once. */
export function hudLayerUrl(layer: HudLayer): string {
  return cachedUrl(`hud:${layer}`, () => hudLayerSvg(layer));
}

/** The stacking and size every layer has; inline, so the figure holds together wherever it is shown (the game's stylesheet adds the poses). */
const LAYER_BOX = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none";

/**
 * The HUD figure: her whole body, head to boots, no pack (the straps clutter
 * her at small size), as a stack of layers.
 *
 * Only what changes is live. Her face (eyes, brows, mouth, which change with
 * her state) and the props (bulb, alert, stars, sweat) are small inline SVGs.
 * Everything else never changes, so it is a picture drawn once and turned
 * into a compositor layer: hair and legs behind, the shirt (which breathes),
 * the hair in front of the face, and each arm (which turn about the shoulder
 * and, for the long reaches, shorten in panjim.css so a gesture stays beside
 * her and clear of her bubble). Animating a transform on a layer costs the
 * compositor, not a repaint of hundreds of curls, and the layers are never
 * filtered. The legs are drawn behind the torso, as in the full figure; the
 * arms in front of the hair so a raised hand is never lost in the curls. The
 * binoculars hand is her resting arm. Class names are the ones panjim.css
 * animates; their pivots are percentages of the layer (tests/mayaArt.test.ts
 * checks them against the art's units).
 */
export function hudFigureSvg(width: number | string, height: number | string): string {
  const paint = live;
  const px = (v: number | string): string => (typeof v === "number" ? `${v}px` : v);
  const { x, y, width: w, height: h } = HUD_VIEWBOX;
  const view = `viewBox="${x} ${y} ${w} ${h}"`;
  const img = (layer: HudLayer, cls: string): string => `<img class="maya-layer ${cls}" src="${hudLayerUrl(layer)}" alt="" draggable="false" style="${LAYER_BOX}">`;
  const props = `<g class="maya-bulb">
      <circle cx="52" cy="56" r="9.5" fill="${paint("bulb")}" stroke="${paint("bulb-edge")}" stroke-width="1.5"/>
      <rect x="47.5" y="65" width="9" height="6" rx="1.2" fill="${paint("bulb-base")}"/>
      <g stroke="${paint("bulb")}" stroke-width="2" stroke-linecap="round">
        <line x1="52" y1="40" x2="52" y2="43.5"/><line x1="38.5" y1="47" x2="41.5" y2="49.5"/><line x1="65.5" y1="47" x2="62.5" y2="49.5"/>
      </g>
    </g>
    <g class="maya-alert">
      <circle cx="50" cy="56" r="11" fill="${paint("alert")}" stroke="${paint("alert-mark")}" stroke-width="1.8"/>
      <rect x="48.3" y="47.5" width="3.4" height="11" rx="1.4" fill="${paint("alert-mark")}"/>
      <circle cx="50" cy="62.8" r="2" fill="${paint("alert-mark")}"/>
    </g>
    <g class="maya-stars" fill="${paint("star")}" stroke="${paint("star-edge")}" stroke-width="0.7">
      <path class="maya-star" d="M46 50 l2.9 6 6.5.7-4.8 4.5 1.3 6.4-5.9-3.2-5.9 3.2 1.3-6.4-4.8-4.5 6.5-.7z"/>
      <path class="maya-star" d="M38 92 l2.4 5 5.5.6-4.1 3.7 1.1 5.4-4.9-2.8-4.9 2.8 1.1-5.4-4.1-3.7 5.5-.6z"/>
      <path class="maya-star" d="M164 104 l1.9 4 4.3.5-3.2 3 .8 4.2-3.8-2.2-3.8 2.2.8-4.2-3.2-3 4.3-.5z"/>
    </g>
    <path class="maya-sweat" d="M127.5 84 Q123 92 127.5 95.5 Q132 92 127.5 84 Z" fill="${paint("sweat")}" stroke="${paint("alert-mark")}" stroke-width="0.8"/>`;
  return `<div class="maya-figure maya-art maya-body" style="${paletteStyle()};position:relative;width:${px(width)};height:${px(height)}" aria-hidden="true">
  ${img("back", "maya-back")}
  ${img("torso", "maya-torso")}
  <div class="maya-head" style="${LAYER_BOX}">
    <svg class="maya-layer maya-face" ${view} style="${LAYER_BOX};overflow:visible" focusable="false">${stateFace(paint)}</svg>
    ${img("hair", "maya-hair")}
  </div>
  ${img("armL", "maya-arm maya-arm-l")}
  ${img("armR", "maya-arm maya-arm-r")}
  <svg class="maya-layer maya-props" ${view} style="${LAYER_BOX};overflow:visible" focusable="false">${props}</svg>
</div>`;
}
