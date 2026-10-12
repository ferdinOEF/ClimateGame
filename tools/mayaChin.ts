/**
 * Section 1c: the new chin next to the old, at 4x, so the change and the
 * untouched features can be compared.
 *
 * Usage:  npx tsx tools/mayaChin.ts [outDir]   (outDir defaults to docs/qa/section1c)
 *
 * Writes maya-chin.png: her face drawn from the current art, and the same
 * figure with the two face paths put back to the old chin curve.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fullFigureSvg } from "../src/ui/panjim/mayaArt";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section1c");

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const now = fullFigureSvg({ pack: false, width: 200, height: 490, paint: "literal" });
  const before = now
    .replace("C70.5 120 83 141 100 146 C117 141 129.5 120 130 100", "C70.5 118 78 137 100 148 C122 137 129.5 118 130 100")
    .replace("C70.5 120 83 141 100 146 C94 133 88 117 88 100", "C70.5 118 78 137 100 148 C94 134 88 117 88 100");
  if (before === now) throw new Error("the old chin was not substituted");
  const face = (svg: string): string => svg.replace('viewBox="0 0 200 490"', 'viewBox="48 44 104 120" width="520" height="600"').replace(/width="200" height="490"/, "");
  const cell = (title: string, svg: string): string => `<figure style="margin:0;color:#dfe8ee;font:16px system-ui">${face(svg)}<figcaption style="text-align:center;margin-top:6px">${title}</figcaption></figure>`;
  const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1120, height: 680 } });
    await page.setContent(`<!doctype html><body style="margin:0;padding:20px;background:#22313a;display:flex;gap:20px">${cell("old: chin to y148", before)}${cell("new: chin to y146, rounder", now)}</body>`);
    await page.screenshot({ path: path.join(OUT, "maya-chin.png") });
    console.log("shot: docs/qa/section1c/maya-chin.png");
  } finally {
    await browser.close();
  }
}

void main();
