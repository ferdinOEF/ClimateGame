/**
 * Crops a region out of the board preview so it can be looked at closely.
 *
 * `buildPanajiMap.ts` writes a 2304px overlay of the whole city, at which size
 * a hex is twenty-odd pixels and the question "is this tile over the river or
 * over Fontainhas" cannot be answered. This cuts a box out of that image and
 * scales it up.
 *
 * Usage: `tsx tools/mapgen/cropPreview.ts <x> <y> <size> [outName]`
 * with the box given in pixels of the preview image.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const SOURCE = path.join(os.tmpdir(), "riptide-panaji-preview.png");

async function main(): Promise<void> {
  const [xRaw, yRaw, sizeRaw, outName] = process.argv.slice(2);
  const x = Number(xRaw);
  const y = Number(yRaw);
  const size = Number(sizeRaw);
  if (![x, y, size].every(Number.isFinite)) {
    console.error("usage: tsx tools/mapgen/cropPreview.ts <x> <y> <size> [outName]");
    process.exitCode = 1;
    return;
  }

  const out = path.join(os.tmpdir(), outName ?? "riptide-crop.png");
  const dataUrl = `data:image/png;base64,${fs.readFileSync(SOURCE).toString("base64")}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body></body></html>");
    await page.evaluate("globalThis.__name = (fn) => fn;");

    const png = await page.evaluate(
      async ({ dataUrl, x, y, size }) => {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("preview failed to decode"));
          img.src = dataUrl;
        });
        const scale = 1200 / size;
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 1200;
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, x, y, size, size, 0, 0, 1200, 1200);
        void scale;
        return canvas.toDataURL("image/png");
      },
      { dataUrl, x, y, size }
    );

    fs.writeFileSync(out, Buffer.from(png.slice(png.indexOf(",") + 1), "base64"));
    console.log(out);
  } finally {
    await browser.close();
  }
}

main();
