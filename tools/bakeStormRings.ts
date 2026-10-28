/**
 * Section 34b (owner, 28 October): bakes the cyclone's rings, pre-blurred, for a browser whose 2D canvas has no
 * `filter` (older Safari). Paints each ring with the game's own `paintRing` in Chromium, which has the blur, and saves
 * it as `public/art/storm-ring-<seed>.png`; the game loads those files only where it cannot blur. Rerun it whenever
 * `src/render/storm/ringPaint.ts` or the rings in `stormSky.ts` change (tests/section34b.test.ts checks the files are
 * there, one per ring, at the painted size).
 *
 * Usage: npx tsx tools/bakeStormRings.ts
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { RING_TEXTURE_SIZE, paintRing } from "../src/render/storm/ringPaint";
import { RINGS, RING_AT } from "../src/render/storm/stormSky";

const OUT = path.resolve("public/art");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const ring of RINGS) {
  const dataUrl = await page.evaluate(
    ({ source, seed, size, ringAt }) => {
      // The function arrives as text; a name helper a TypeScript runner may add is a no-op here.
      (window as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
      const paint = new Function(`return (${source})`)() as (g: CanvasRenderingContext2D, seed: number, size: number, ringAt: number) => void;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const g = canvas.getContext("2d")!;
      if (!("filter" in CanvasRenderingContext2D.prototype)) throw new Error("this browser cannot blur a canvas");
      paint(g, seed, size, ringAt);
      return canvas.toDataURL("image/png");
    },
    { source: paintRing.toString(), seed: ring.seed, size: RING_TEXTURE_SIZE, ringAt: RING_AT }
  );
  const file = path.join(OUT, `storm-ring-${ring.seed}.png`);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`${path.relative(process.cwd(), file)}  ${fs.statSync(file).size} bytes`);
}
await browser.close();
