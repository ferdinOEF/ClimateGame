import { describe, expect, it } from "vitest";
import fs from "node:fs";

/**
 * Section 33.1 (owner decision): Harbour Morning's tokens (src/ui/theme.css). Every text and background pair the
 * interface uses meets WCAG AA, calm and storm: 4.5:1, or 3:1 for text 24 px and larger.
 */
const THEME = fs.readFileSync("src/ui/theme.css", "utf8");
const SHEETS = ["src/ui/hud.css", "src/ui/panjim/panjim.css", "src/ui/screens/screens.css"];

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
  ["warn-ink", "gold-soft"]
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
        if (!color || !bg || !(color in CALM) || !(bg in CALM)) continue;
        expect(ALLOWED.has(`${color}|${bg}`), `${file}: ${m[1].trim()} puts --${color} on --${bg}`).toBe(true);
      }
    }
  });
});
