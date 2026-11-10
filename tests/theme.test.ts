import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";

/**
 * Section 33.1 (owner decision): Harbour Morning's tokens (src/ui/theme.css), with Section 33b.1's Tone A values. Every text and background pair the
 * interface uses meets WCAG AA, calm and storm: 4.5:1, or 3:1 for text 24 px and larger.
 */
const THEME = fs.readFileSync("src/ui/theme.css", "utf8");
const SHEETS = ["src/ui/hud.css", "src/ui/panjim/panjim.css", "src/ui/screens/screens.css", "src/ui/harbour.css", "src/ui/fiveColours.css"];

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
  ...["ink", "ink-2", "ink-soft", "ink-3", "accent-ink", "good", "warn-ink"].flatMap((t) => [[t, "panel"], [t, "panel-raised"]] as [string, string][]),
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
  ["panel-raised", "good"],
  // Section 39.3: How to play's "Game rules" chip.
  ["ink-2", "panel-edge"]
];
const ALLOWED = new Set(PAIRS.map(([t, b]) => `${t}|${b}`));

/**
 * Section 40 (owner decision): the five colours. One block on the static screens' root elements; the game keeps
 * `:root`. `FIVE_ROOTS` is the block's selector list, `FIVE` its values.
 */
const FIVE_ROOTS = [
  ".screen-layer.five-colours",
  ".screen.menu-screen",
  ".menu-quote",
  ".menu-art-credit",
  ".sources-backdrop",
  ".brief-backdrop.howto-backdrop",
  ".name-card",
  ".howto-card",
  ".result-cards",
  ".leave-confirm-backdrop",
  ".replay-card",
  ".idle-warning"
];
const FIVE = block(FIVE_ROOTS.join(",\n"));
/** The pairs above, and the ones the block's own variables add. */
const FIVE_PAIRS: [string, string, boolean?][] = [
  ...PAIRS,
  ["storm-band-ink", "storm-band"],
  ["star", "star-pill"],
  ["band-ink-2", "band"],
  ["ink", "teal"],
  ["ink", "teal-soft"],
  ["ink", "blue-soft"],
  ["ink", "purple-soft"],
  // The player's own row on the board, a chosen feedback star and the top three ranks: --ink on gold.
  ["ink", "star"],
  // Points on the Top 10 and the board box: gold on the plum band.
  ["star", "band"],
  // A storm card's top in How to play: the dark ink on the cyclone's pink and the flood's blue.
  ["storm-band-ink", "icon-cyclone"],
  ["storm-band-ink", "icon-flood"],
  ["cta-ink", "teal"],
  // The main screen's page, under the board render.
  ["ink", "screen-ground"],
  // Pairs two rules make between them: a pink leaf chip, and the icon tiles' lines on their soft grounds.
  ["ink", "warn"],
  ["ink-2", "warn-soft"],
  ["ink-2", "blue-soft"],
  ["ink-2", "purple-soft"]
];
/**
 * Section 40.7 (owner): marks that are not text but carry meaning, each at 3:1 or better on its ground: the homes
 * saved bar's fill on its track, the bars on "What protected your homes" on theirs, and an empty feedback star's
 * outline and edge on its button.
 */
const FIVE_MARKS: [string, string][] = [
  ["good", "warn-soft"],
  ["good", "panel-shadow"],
  ["strip", "panel"]
];
const FIVE_ALLOWED = new Set(FIVE_PAIRS.map(([t, b]) => `${t}|${b}`));
/** The variables only the block has. */
const FIVE_ONLY = Object.keys(FIVE).filter((key) => !(key in CALM));

describe("Section 33.1: Harbour Morning's tokens", () => {
  it("defines every token in both moods, as the brief gives them", () => {
    // Section 33b.1 (owner decision): Tone A, Sand and Sea.
    expect(CALM.panel).toBe("#f6edd9");
    expect(STORM.panel).toBe("#efe2c6");
    expect(CALM["panel-edge"]).toBe("#e2d2ae");
    expect(STORM["panel-edge"]).toBe("#cdb98d");
    expect(CALM.cta).toBe("#e8913a");
    expect(STORM.band).toBe("#24574f");
    expect(CALM.band).toBe("#2e6e64");
    expect(STORM.overlay).toBe("rgba(20, 45, 42, 0.45)");
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

describe("Section 40: the five colours on the static screens", () => {
  const sha = (text: string): string => crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
  const whole = (selector: string): string => {
    const start = THEME.indexOf(`${selector} {`);
    return THEME.slice(start, THEME.indexOf("}", start) + 1);
  };

  it("`:root` and `:root.storm` hold every value they had: the game's colours did not move", () => {
    expect(sha(whole(":root"))).toBe("01e02fc046968bb6a7ae69f96193325a778b16c07620c84fee874e7f46d002a0");
    expect(sha(whole(":root.storm"))).toBe("b4efd6d159a1ee935b5078cfb0741d17cec6f912bbc6fac4daa9cf0a31a86d5e");
  });

  it("one block, after `:root.storm`, on the static screens' roots, with no storm copy", () => {
    const at = THEME.indexOf(`${FIVE_ROOTS.join(",\n")} {`);
    expect(at).toBeGreaterThan(THEME.indexOf(":root.storm {"));
    expect(at).toBeLessThan(THEME.indexOf("@property --panel "));
    // The same calm and storm: nothing sets these roots' variables under `.storm`.
    expect(THEME).not.toMatch(/\.storm[^{};]*\.(five-colours|menu-screen|menu-quote|sources-backdrop|howto-backdrop|name-card|howto-card|result-cards|leave-confirm-backdrop|replay-card|idle-warning)/);
    // No fixed variable and no font is set on them.
    for (const key of Object.keys(FIVE)) expect(key, key).not.toMatch(/^fixed-|^font-/);
  });

  it("the five colours and the two dark shades, as the brief gives them", () => {
    expect(FIVE.teal).toBe("#4fc8b7");
    expect(FIVE.cta).toBe("#4fc8b7");
    expect(FIVE.warn).toBe("#e696a6");
    expect(FIVE["storm-band"]).toBe("#e696a6");
    expect(FIVE.gold).toBe("#d2ad68");
    expect(FIVE.star).toBe("#d2ad68");
    expect(FIVE["button-border"]).toBe("#76adbc");
    expect(FIVE["screen-ground"]).toBe("#76adbc");
    expect(FIVE.strip).toBe("#a075ae");
    expect(FIVE.ink).toBe("#2a2038");
    expect(FIVE.band).toBe("#4a3358");
    expect(FIVE_ONLY.sort()).toEqual(["band-ink-2", "band-rule", "blue-soft", "purple-soft", "screen-ground", "star", "star-pill", "storm-band", "storm-band-ink", "strip", "teal", "teal-soft"]);
  });

  it("every text and background pair meets 4.5:1 (3:1 large) in the block", () => {
    for (const [text, bg, large] of FIVE_PAIRS) {
      expect(FIVE[text], text).toMatch(/^#[0-9a-f]{6}$/);
      expect(FIVE[bg], bg).toMatch(/^#[0-9a-f]{6}$/);
      const ratio = contrast(FIVE[text], FIVE[bg]);
      expect(ratio, `five colours: --${text} on --${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(large ? 3 : 4.5);
    }
  });

  it("Section 40.7: the homes bar's fill and the empty feedback star reach 3:1 on their grounds, as the sheet draws them", () => {
    for (const [mark, ground] of FIVE_MARKS) {
      const ratio = contrast(FIVE[mark], FIVE[ground]);
      expect(ratio, `five colours: the mark --${mark} on --${ground} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
    const five = fs.readFileSync("src/ui/fiveColours.css", "utf8");
    // The homes saved bar and the rows' bars share the dark teal.
    expect(five).toMatch(/\.result-cards \.result-bar \{[^}]*background: var\(--warn-soft\);[^}]*\}\s*\.result-cards \.result-bar span \{\s*background: var\(--good\);/);
    expect(five).toMatch(/\.result-cards \.result-row-bar span \{\s*background: var\(--good\);/);
    // The empty star: its edge and its outline star in the purple, on the light button.
    expect(five).toMatch(/\.result-cards \.fb-star \{\s*border: 1\.5px solid var\(--strip\);\s*background: var\(--panel\);[^}]*-webkit-text-stroke: 1\.2px var\(--strip\);/);
    // The pairs they replace were too faint.
    expect(contrast(FIVE.teal, FIVE["warn-soft"])).toBeLessThan(3);
    expect(contrast(FIVE["panel-shadow"], FIVE.panel)).toBeLessThan(3);
  });

  it("purple carries no small text: it is the text of no pair", () => {
    // Too weak for small text on light and on dark (the brief), so strips, icon circles and marks only.
    expect(contrast(FIVE.strip, FIVE.panel)).toBeLessThan(4.5);
    expect(contrast(FIVE.strip, FIVE.band)).toBeLessThan(4.5);
    for (const [text, bg] of FIVE_PAIRS) expect(["strip", "icon-wind", "icon-both"], `${text} on ${bg}`).not.toContain(text);
  });

  it("the block's own variables are used only in rules that sit under a static screen's root", () => {
    // Outside the block they are undefined: a rule in the game's interface that named one would draw nothing.
    const UNDER = /^\.(screen-layer\.five-colours|screen\.menu-screen|menu-quote|menu-bar|name-card|howto-|brief-cta\.howto-cta|result-cards|leave-confirm-backdrop|replay-card|idle-warning)/;
    const uses = new RegExp(`var\\(--(${FIVE_ONLY.join("|")})\\)`);
    let found = 0;
    for (const file of SHEETS) {
      const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!uses.test(m[2])) continue;
        found++;
        expect(file, `${file}: ${m[1].trim()}`).not.toBe("src/ui/hud.css");
        for (const selector of m[1].split(",")) expect(selector.trim(), `${file}: ${selector.trim()} uses one of the block's own variables`).toMatch(UNDER);
      }
    }
    expect(found).toBeGreaterThan(20);
  });

  it("purple is the text colour of no rule but a drawn mark's (an arrow, a chevron, the quote mark)", () => {
    for (const file of SHEETS) {
      const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/(?:^|[;\s])color:\s*var\(--(strip|icon-wind|icon-both)\)/.test(m[2])) continue;
        expect(m[1].trim(), `${file}: ${m[1].trim()} sets purple text`).toMatch(/^\.(howto-arrow|howto-chevron|menu-quote \.menu-quote-mark)$/);
      }
    }
  });

  it("a rule that uses one of the block's own variables for text or for a background uses an allowed pair", () => {
    for (const file of SHEETS) {
      const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = m[2];
        const color = /(?:^|[;\s])color:\s*var\(--([a-z0-9-]+)\)/.exec(body)?.[1];
        const bg = /background(?:-color)?:\s*var\(--([a-z0-9-]+)\)/.exec(body)?.[1];
        if (!color || !bg || !(color in FIVE) || !(bg in FIVE)) continue;
        if (!FIVE_ONLY.includes(color) && !FIVE_ONLY.includes(bg)) continue;
        expect(FIVE_ALLOWED.has(`${color}|${bg}`), `${file}: ${m[1].trim()} puts --${color} on --${bg}`).toBe(true);
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
    expect(THEME).toContain("--mesh: #ede0c4;");
    expect(THEME).toContain("--mesh-dot: #d2bf97;");
    expect(THEME).toContain("--overlay: rgba(20, 45, 42, 0.35);");
    // No blurred shadow anywhere in the shapes.
    for (const m of harbour.matchAll(/box-shadow:([^;]+);/g)) expect(m[1], m[1]).not.toMatch(/\d+px \d+px \d+px [^0]/);
  });

  it("the main action: --cta, a flat shadow and two dashed stitches; focus is a 3 px --button-on-border outline", () => {
    expect(harbour).toMatch(/\.btn-primary \{\s*position: relative;\s*background: var\(--cta\);\s*color: var\(--cta-ink\);[^}]*box-shadow: 0 4px 0 var\(--cta-shadow\);/);
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
    for (const side of ["right", "above"]) expect(panjim).toMatch(new RegExp(`\\.maya-bubble\\.side-${side}::before \\{[^}]*-color: var\\(--panel\\);`));
    // Maya's figure is untouched: no sheet but panjim.css styles her bubble.
    expect(fs.readFileSync("src/ui/harbour.css", "utf8")).not.toMatch(/\.maya/);
  });
});

describe("Section 33.5: every interface colour comes from the tokens", () => {
  const COLOUR_PROPS = /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|accent-color|caret-color|text-decoration(-color)?|-webkit-text-stroke|filter|(-webkit-)?mask-image)$/;
  const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|red|green|blue|gr[ae]y|gold|orange|yellow|navy|silver|maroon|purple|brown|beige|ivory|tan)\b/;
  // Section 40: the static screens' block adds variables of its own (--star, --strip and the rest).
  const DEFINED = new Set([...Object.keys(CALM), ...Object.keys(FIVE)]);

  for (const file of SHEETS) {
    it(`${file} names no colour of its own`, () => {
      const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
        const [, prop, value] = m;
        if (!COLOUR_PROPS.test(prop)) continue;
        expect(value.replace(/var\([^)]*\)/g, ""), `${file}: ${prop}: ${value}`).not.toMatch(LITERAL);
        // Every variable a colour uses is a token; the others are Maya's sizes, the arrival edge's colour (set per
        // storm by hud.ts, its fallback a token) and the guided start's spotlight position (Section 39.4).
        for (const v of value.matchAll(/var\(--([a-z0-9-]+)/g)) expect(DEFINED.has(v[1]) || /^maya-|^arrival-flash-color$|^guide-[xyr]$/.test(v[1]), `${file}: ${prop} uses --${v[1]}`).toBe(true);
      }
      expect(css).not.toMatch(/--rr-/);
    });
  }
});
