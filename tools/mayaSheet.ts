/**
 * Section 1b/1c: Maya's artwork on its own, for looking at.
 *
 * Usage:  npx tsx tools/mayaSheet.ts [outDir]
 *   outDir defaults to docs/qa/section1c.
 *
 * Writes:
 *   - maya-full.png: the full figure, with and without the pack, at 2.5x
 *     (fingers, binoculars and kit at a size where they must read);
 *   - maya-hud-crop.png: the HUD's whole-body crop (no pack) at about 1x, 2x and 4x its size on a 1080p screen;
 *   - and a `-gray` twin of each.
 * Prints the node count of each piece. The live states are photographed in
 * the game by tools/mayaStates.ts.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fullFigureSvg, HUD_VIEWBOX, hudFigureSvg } from "../src/ui/panjim/mayaArt";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section1c");

const nodes = (svg: string): number => (svg.match(/<[a-zA-Z]/g) ?? []).length;

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const withPack = fullFigureSvg({ pack: true, width: 500, height: 1225, paint: "live" });
  const noPack = fullFigureSvg({ pack: false, width: 500, height: 1225, paint: "live" });
  const hud = (w: number): string => hudFigureSvg(w, Math.round((w * HUD_VIEWBOX.height) / HUD_VIEWBOX.width));
  console.log(`nodes: full figure with pack ${nodes(withPack)}, without ${nodes(noPack)}, HUD figure ${nodes(hud(103))}`);
  const page = (body: string, bg: string): string =>
    `<!doctype html><html><body style="margin:0;padding:24px;background:${bg};display:flex;gap:24px;align-items:flex-end;font:14px system-ui;color:#dfe8ee">${body}</body></html>`;
  const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
  try {
    const shots: [string, string, { width: number; height: number }][] = [
      ["maya-full", page(`${withPack}${noPack}`, "linear-gradient(#2b3e4a,#1a2730)"), { width: 1072, height: 1275 }],
      ["maya-hud-crop", page(`${hud(103)}${hud(206)}${hud(412)}`, "linear-gradient(#2b3e4a,#1a2730)"), { width: 820, height: 1140 }]
    ];
    for (const [name, html, viewport] of shots) {
      const p = await browser.newPage({ viewport });
      await p.setContent(html);
      await p.screenshot({ path: path.join(OUT, `${name}.png`) });
      await p.addStyleTag({ content: "html { filter: grayscale(1); }" });
      await p.screenshot({ path: path.join(OUT, `${name}-gray.png`) });
      await p.close();
      console.log(`shot: ${path.relative(ROOT, path.join(OUT, name))}.png (+ gray)`);
    }
  } finally {
    await browser.close();
  }
}

void main();
