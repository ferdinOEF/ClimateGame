import { describe, expect, it } from "vitest";
import fs from "node:fs";

/**
 * Section 33.1 (owner decision): Harbour Morning's tokens (src/ui/theme.css). Every text and background pair the
 * interface uses meets WCAG AA, calm and storm: 4.5:1, or 3:1 for text 24 px and larger.
 */
const THEME = fs.readFileSync("src/ui/theme.css", "utf8");
const SHEETS = ["src/ui/hud.css", "src/ui/panjim/panjim.css", "src/ui/screens/screens.css", "src/ui/harbour.css"];

function block(selector: string): Record<string, string> {
  const start = THEME.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = THEME.slice(start, THEME.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const CALM = block(":root");
const STORM = { ...CALM, ...block(":root.storm") };

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** [text, background, large]: every pair the interface's CSS may use. */
const PAIRS: [string, string, boolean?][] = [
  ...["ink", "ink-2", "ink-3", "accent-ink", "good", "warn-ink"].flatMap((t) => [[t, "panel"], [t, "panel-raised"]] as [string, string][]),
  ["band-ink", "band"],
  ...["ink", "ink-2", "ink-3", "accent-ink"].map((t) => [t, "button"] as [string, string]),
  ...["ink", "ink-2"].map((t) => [t, "button-on"] as [string, string]),
  ["cta-ink", "cta"],
  ["warn-ink", "warn-soft"],
  ["ink", "warn-soft"],
  ["ink", "gold-soft"],
  ["ink-2", "gold-soft"],
  ["warn-ink", "gold-soft"],
  // A badge or chip in --good with light text ("Built", "Stood").
  ["panel-raised", "good"]
];
const ALLOWED = new Set(PAIRS.map(([t, b]) => `${t}|${b}`));

describe("Section 33.1: Harbour Morning's tokens", () => {
  it("defines every token in both moods, as the brief gives them", () => {
    expect(CALM.panel).toBe("#f2ebdd");
    expect(STORM.panel).toBe("#e9dcc3");
    expect(CALM.cta).toBe("#e3a93b");
    expect(STORM.band).toBe("#4a6e99");
    for (const key of Object.keys(block(":root.storm"))) expect(CALM[key], key).toBeDefined();
  });

  for (const [mood, tokens] of [["calm", CALM], ["storm", STORM]] as const) {
    it(`every text and background pair meets 4.5:1 (3:1 large), ${mood}`, () => {
      for (const [text, bg, large] of PAIRS) {
        const ratio = contrast(tokens[text], tokens[bg]);
        expect(ratio, `${mood}: --${text} on --${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(large ? 3 : 4.5);
      }
    });
  }

  it("a rule that sets both a token text colour and a token background uses an allowed pair", () => {
    for (const file of SHEETS) {
      const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = m[2];
        const color = /(?:^|[;\s])color:\s*var\(--([a-z0-9-]+)\)/.exec(body)?.[1];
        const bg = /background(?:-color)?:\s*var\(--([a-z0-9-]+)\)/.exec(body)?.[1];
        if (!color || !bg || !(color in CALM) || !(bg in CALM) || color.startsWith("fixed-") || bg.startsWith("fixed-")) continue;
        expect(ALLOWED.has(`${color}|${bg}`), `${file}: ${m[1].trim()} puts --${color} on --${bg}`).toBe(true);
      }
    }
  });
});

describe("Section 33.2: the storm hues", () => {
  const controller = fs.readFileSync("src/app/panjimController.ts", "utf8");

  it("html takes `storm` as a storm starts playing and drops it as its result cards open", () => {
    const play = controller.indexOf("await this.host.challengeFx.play(");
    const on = controller.indexOf("this.stormHues(true)");
    expect(on).toBeGreaterThan(0);
    expect(on).toBeLessThan(play);
    // Every result card show in a storm's results comes after the hues go back to calm.
    const results = controller.slice(controller.indexOf("private async showResults("), controller.indexOf("private tutorialRows("));
    for (const m of results.matchAll(/this\.resultCards\.show\(/g)) expect(results.slice(0, m.index).lastIndexOf("this.stormHues(false)"), "a result card opens in storm hues").toBeGreaterThan(-1);
    expect(controller).toMatch(/dispose\(\): void \{[\s\S]*classList\.remove\("storm", "storm-instant"\)/);
  });

  it("only the variables change: they fade over 600 ms, at once with Calm motion", () => {
    expect(THEME).toMatch(/@property --panel \{ syntax: "<color>"/);
    expect(THEME).toMatch(/transition-duration: 600ms/);
    expect(THEME).toMatch(/:root\.storm-instant \{\s*transition: none;/);
    expect(controller).toMatch(/classList\.toggle\("storm-instant", Boolean\(this\.motionToggle\?\.value\)/);
    // Every token that changes in a storm is registered, so it fades rather than jumps.
    for (const key of Object.keys(block(":root.storm"))) if (CALM[key] !== STORM[key]) expect(THEME, key).toContain(`@property --${key} `);
  });

  it("the Homes at risk box wears a 3 px --warn ring at 30% in a storm", () => {
    expect(THEME).toMatch(/:root\.storm \.outlook-risk \{\s*box-shadow: inset 0 0 0 1px var\(--warn\), 0 0 0 3px color-mix\(in srgb, var\(--warn\) 30%, transparent\);/);
  });
});

describe("Section 33.3: the fonts", () => {
  it("Zilla Slab 600 and 700 and Work Sans 400 to 700 are bundled (latin), Fraunces gone", () => {
    const main = fs.readFileSync("src/main.ts", "utf8");
    for (const w of [600, 700]) expect(main).toContain(`import "@fontsource/zilla-slab/latin-${w}.css";`);
    for (const w of [400, 500, 600, 700]) expect(main).toContain(`import "@fontsource/work-sans/latin-${w}.css";`);
    expect(main).not.toMatch(/fraunces/i);
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.dependencies["@fontsource/fraunces"]).toBeUndefined();
    expect(pkg.dependencies["@fontsource/zilla-slab"]).toBeDefined();
    expect(pkg.dependencies["@fontsource/work-sans"]).toBeDefined();
    expect(THEME).toContain('--font-head: "Zilla Slab", Georgia, serif;');
    expect(THEME).toContain('--font-body: "Work Sans", system-ui, sans-serif;');
  });

  it("no sheet names Fraunces, Segoe UI or Inter", () => {
    for (const file of [...SHEETS, "index.html"]) expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/Fraunces|Segoe UI|"Inter"|\bInter,/);
  });
});

describe("Section 33.4: the shapes", () => {
  const harbour = fs.readFileSync("src/ui/harbour.css", "utf8");

  it("panels: --panel, a flat shadow and no blur; large modal cards carry the --warn strip and the mesh strip", () => {
    expect(harbour).toMatch(/\.menu-card \{\s*background: var\(--panel\);[^}]*box-shadow: 0 4px 0 var\(--panel-shadow\);/);
    expect(harbour).toMatch(/border-left: 14px solid var\(--warn\);\s*border-right: 20px solid transparent;/);
    expect(harbour).toMatch(/radial-gradient\(circle at 4px 4px, var\(--mesh-dot\) 2\.2px, transparent 2\.7px\) 0 0 \/ 8px 8px border-box/);
    expect(THEME).toContain("--mesh: #e6dcc7;");
    expect(THEME).toContain("--mesh-dot: #cbbd9f;");
    expect(THEME).toContain("--overlay: rgba(27, 42, 60, 0.35);");
    // No blurred shadow anywhere in the shapes.
    for (const m of harbour.matchAll(/box-shadow:([^;]+);/g)) expect(m[1], m[1]).not.toMatch(/\d+px \d+px \d+px [^0]/);
  });

  it("the main action: --cta, a flat shadow and two dashed stitches; focus is a 3 px --button-on-border outline", () => {
    expect(harbour).toMatch(/\.finale-done \{\s*position: relative;\s*background: var\(--cta\);\s*color: var\(--cta-ink\);[^}]*box-shadow: 0 4px 0 var\(--cta-shadow\);/);
    expect(harbour).toMatch(/border-top: 1\.5px dashed var\(--cta-stitch\);\s*border-bottom: 1\.5px dashed var\(--cta-stitch\);/);
    expect(harbour).toMatch(/button:focus-visible,[\s\S]*?\{\s*outline: 3px solid var\(--button-on-border\);\s*outline-offset: 2px;/);
  });
});

describe("Section 33.4c: Maya's bubble (panjim.css only)", () => {
  const panjim = fs.readFileSync("src/ui/panjim/panjim.css", "utf8");
  it("--panel with the flat shadow, her name in --accent-ink small caps above a dashed stitch, the tail in --panel", () => {
    expect(panjim).toMatch(/\.maya-bubble \{[^}]*background: var\(--panel\);[^}]*box-shadow: 0 4px 0 var\(--panel-shadow\);/);
    expect(panjim).toMatch(/\.maya-name \{[^}]*font-variant: small-caps;/);
    expect(panjim).toMatch(/\.maya-name \{[^}]*color: var\(--accent-ink\);/);
    expect(panjim).toMatch(/\.maya-name::after \{[^}]*border-top: 1\.5px dashed var\(--stitch\);/);
    for (const side of ["right", "left", "above"]) expect(panjim).toMatch(new RegExp(`\\.maya-bubble\\.side-${side}::before \\{[^}]*-color: var\\(--panel\\);`));
    // Maya's figure is untouched: no sheet but panjim.css styles her bubble.
    expect(fs.readFileSync("src/ui/harbour.css", "utf8")).not.toMatch(/\.maya/);
  });
});

describe("Section 33.5: every interface colour comes from the tokens", () => {
  const COLOUR_PROPS = /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|accent-color|caret-color|text-decoration(-color)?|-webkit-text-stroke|filter|(-webkit-)?mask-image)$/;
  const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|red|green|blue|gr[ae]y|gold|orange|yellow|navy|silver|maroon|purple|brown|beige|ivory|tan)\b/;
  const DEFINED = new Set(Object.keys(CALM));

  for (const file of SHEETS) {
    it(`${file} names no colour of its own`, () => {
      const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
        const [, prop, value] = m;
        if (!COLOUR_PROPS.test(prop)) continue;
        expect(value.replace(/var\([^)]*\)/g, ""), `${file}: ${prop}: ${value}`).not.toMatch(LITERAL);
        // Every variable a colour uses is a token; the others are Maya's sizes and the arrival edge's colour (set per
        // storm by hud.ts, its fallback a token).
        for (const v of value.matchAll(/var\(--([a-z0-9-]+)/g)) expect(DEFINED.has(v[1]) || /^maya-|^arrival-flash-color$/.test(v[1]), `${file}: ${prop} uses --${v[1]}`).toBe(true);
      }
      expect(css).not.toMatch(/--rr-/);
    });
  }
});
