/**
 * STEP_PROMPT_visuals_map_river.md item 1: a scripted, repeatable
 * readability check, not a one-off manual grayscale look. Boots the game,
 * claims one tile of each buildable terrain type, pans the camera so that
 * tile (and a same-terrain unclaimed neighbor) sit at screen center, and
 * reads the REAL rendered pixel color straight off the live WebGL canvas
 * via `gl.readPixels` (needs `preserveDrawingBuffer: true` on the
 * renderer — see scene.ts) rather than trusting palette math on paper or
 * decoding a screenshot file. Asserts the claimed/unclaimed grayscale
 * luminance (0.3R+0.59G+0.11B) delta clears a threshold for every
 * buildable terrain type, and prints the cross-terrain unclaimed spread so
 * a human can eyeball that terrain types stay distinguishable from each
 * other too.
 */
import { chromium } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import * as THREE from "three";
import mapData from "../src/data/map.json";
import startingStateData from "../src/data/startingState.json";
import { axialDistance } from "../src/core/hex";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_PORT = 5231;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const VIEWPORT = { width: 1000, height: 700 };
const HEX_SIZE = 1.0;
const CAM_DISTANCE = 18;
const CAM_ELEVATION_DEG = 58;
const LUMA_DELTA_THRESHOLD = 30;

function worldOf(q: number, r: number): { x: number; z: number } {
  return { x: HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r), z: HEX_SIZE * 1.5 * r };
}

function luma(r: number, g: number, b: number): number {
  return 0.3 * r + 0.59 * g + 0.11 * b;
}

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() - start > timeoutMs) reject(new Error("timeout"));
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

/** Screen pixel coords a world point projects to, replicating scene.ts's camera exactly. */
function projectToPixel(worldX: number, worldZ: number, worldY: number): { x: number; y: number } {
  const camera = new THREE.PerspectiveCamera(38, VIEWPORT.width / VIEWPORT.height, 0.1, 200);
  const rad = THREE.MathUtils.degToRad(CAM_ELEVATION_DEG);
  camera.position.set(worldX, Math.sin(rad) * CAM_DISTANCE, worldZ + Math.cos(rad) * CAM_DISTANCE);
  camera.lookAt(worldX, 0, worldZ);
  camera.updateMatrixWorld();
  const v = new THREE.Vector3(worldX, worldY, worldZ).project(camera);
  return { x: ((v.x + 1) / 2) * VIEWPORT.width, y: ((1 - v.y) / 2) * VIEWPORT.height };
}

interface MapFile {
  tiles: { q: number; r: number; terrainId: string }[];
  startingClaim: { q: number; r: number }[];
}
const MAP = mapData as MapFile;
const STARTING_STATE = startingStateData as { prebuiltHouses: { q: number; r: number }[] };

// Tiles claimed from the very first frame — must be excluded from
// candidate selection, or "claim one, sample it vs. an unclaimed
// neighbor" can silently sample two ALREADY-claimed tiles (both read the
// same color, a false FAIL, not a real readability problem).
const preClaimedKeys = new Set(
  [...MAP.startingClaim, ...STARTING_STATE.prebuiltHouses].map((c) => `${c.q},${c.r}`)
);

async function main(): Promise<void> {
  let devServer: ChildProcess | undefined;
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  devServer = spawn(npmCmd, ["run", "dev", "--", "--port", String(DEV_PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: "pipe",
    shell: true
  });

  try {
    await waitForServer(DEV_URL, 20000);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.goto(DEV_URL + "?coinboost=2000", { waitUntil: "networkidle" });
    await page.waitForSelector("canvas", { timeout: 10000 });
    await page.waitForTimeout(1000);

    async function focusOn(worldX: number, worldZ: number): Promise<void> {
      await page.evaluate(
        ({ x, z }) => (window as unknown as { __focusOnForTest?: (x: number, z: number) => void }).__focusOnForTest?.(x, z),
        { x: worldX, z: worldZ }
      );
    }

    // Exposes the scene's own `focusOn` so panning is exact (no drag-math
    // approximation needed) — a small, dev-only hook, harmless in prod.
    const hasHook = await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__focusOnForTest === "function");
    if (!hasHook) {
      console.error("__focusOnForTest hook not found on window — is main.ts exposing it? See tools/verify_readability.ts's comment.");
      process.exitCode = 1;
      return;
    }

    async function samplePixel(px: number, py: number): Promise<[number, number, number]> {
      const rgb = await page.evaluate(
        ({ x, y, w, h }) => {
          const canvas = document.querySelector("canvas") as HTMLCanvasElement;
          const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext;
          // Use the canvas's ACTUAL drawing-buffer size, not the caller's
          // assumed viewport — they can differ (devicePixelRatio rounding,
          // scrollbars), and a mismatch here silently samples the wrong
          // pixel row (WebGL's row 0 is the bottom, unlike CSS/screen y).
          const realW = gl.drawingBufferWidth;
          const realH = gl.drawingBufferHeight;
          const scaleX = realW / w;
          const scaleY = realH / h;
          const glX = Math.round(x * scaleX);
          const glY = Math.round(realH - y * scaleY);
          const size = 3;
          const pixels = new Uint8Array(size * size * 4);
          gl.readPixels(glX - Math.floor(size / 2), glY - Math.floor(size / 2), size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let r = 0, g = 0, b = 0;
          const n = size * size;
          for (let i = 0; i < n; i++) {
            r += pixels[i * 4];
            g += pixels[i * 4 + 1];
            b += pixels[i * 4 + 2];
          }
          return [r / n, g / n, b / n];
        },
        { x: px, y: py, w: VIEWPORT.width, h: VIEWPORT.height }
      );
      return rgb as [number, number, number];
    }

    // Must match terrain.json's `height` — the sample pixel needs to be the
// tile's actual top-surface world Y, not ground level (0). Projecting at
// y=0 still lands at exact screen center (matching `focusOn`'s own
// lookAt target), but the VISIBLE top face of a raised hex prism sits at a
// different screen position than its y=0 footprint — for short terrain
// (River/Estuary, height 0.3) squeezed next to tall terrain (Land, height
// 0.55), sampling at y=0 can catch a taller neighbor's face instead of the
// intended tile.
const TERRAIN_HEIGHT: Record<string, number> = { coast: 0.3, beach: 0.55, land: 0.55, river: 0.3, estuary: 0.3 };

const terrainTypes = ["beach", "land", "river", "estuary"];
    const results: { terrain: string; claimedLuma: number; unclaimedLuma: number; delta: number }[] = [];

    for (const terrainId of terrainTypes) {
      const candidates = MAP.tiles.filter((t) => t.terrainId === terrainId && !preClaimedKeys.has(`${t.q},${t.r}`));
      if (candidates.length < 2) {
        console.error(`Not enough unclaimed ${terrainId} tiles to sample (need 2, found ${candidates.length}).`);
        continue;
      }
      // Pick the pair with the GREATEST hex distance apart, not an
      // arbitrary index split — a small terrain feature like Estuary can
      // have every tile mutually adjacent, and sampling two neighbors
      // risks the anti-aliased edge of the just-claimed (bright) tile
      // bleeding into the "unclaimed" sample right next to it.
      let claimTarget = candidates[0];
      let unclaimedTarget = candidates[1];
      let bestDist = -1;
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const d = axialDistance(candidates[i], candidates[j]);
          if (d > bestDist) {
            bestDist = d;
            claimTarget = candidates[i];
            unclaimedTarget = candidates[j];
          }
        }
      }

      // Claim one, sample it.
      const topY = TERRAIN_HEIGHT[terrainId];
      const claimWorld = worldOf(claimTarget.q, claimTarget.r);
      await focusOn(claimWorld.x, claimWorld.z);
      await page.waitForTimeout(150);
      const claimPixel = projectToPixel(claimWorld.x, claimWorld.z, topY);
      const tilesBefore = await page.evaluate(() => document.querySelector(".tile-count-value")?.textContent);
      await page.mouse.click(claimPixel.x, claimPixel.y);
      await page.waitForTimeout(500); // let the settle animation finish so the sampled color is the resting one
      const tilesAfter = await page.evaluate(() => document.querySelector(".tile-count-value")?.textContent);
      if (tilesBefore === tilesAfter) console.error(`[warning] ${terrainId} claim click did not register (tiles stayed at ${tilesBefore})`);
      const [cr, cg, cb] = await samplePixel(claimPixel.x, claimPixel.y);
      const claimedLuma = luma(cr, cg, cb);

      // Sample the unclaimed neighbor of the same terrain.
      const unclaimedWorld = worldOf(unclaimedTarget.q, unclaimedTarget.r);
      await focusOn(unclaimedWorld.x, unclaimedWorld.z);
      await page.waitForTimeout(150);
      const unclaimedPixel = projectToPixel(unclaimedWorld.x, unclaimedWorld.z, topY);
      const [ur, ug, ub] = await samplePixel(unclaimedPixel.x, unclaimedPixel.y);
      const unclaimedLuma = luma(ur, ug, ub);

      results.push({ terrain: terrainId, claimedLuma, unclaimedLuma, delta: claimedLuma - unclaimedLuma });
    }

    console.log("\nTerrain      Claimed Luma   Unclaimed Luma   Delta   Threshold(>=30)");
    let anyFail = false;
    for (const r of results) {
      const pass = Math.abs(r.delta) >= LUMA_DELTA_THRESHOLD;
      if (!pass) anyFail = true;
      console.log(
        `${r.terrain.padEnd(12)} ${r.claimedLuma.toFixed(1).padStart(12)} ${r.unclaimedLuma.toFixed(1).padStart(16)} ${r.delta.toFixed(1).padStart(8)}   ${pass ? "PASS" : "FAIL"}`
      );
    }
    console.log("\nUnclaimed cross-terrain spread (for eyeballing distinctness):");
    for (const r of results) console.log(`  ${r.terrain.padEnd(10)} ${r.unclaimedLuma.toFixed(1)}`);
    console.log("Claimed cross-terrain spread:");
    for (const r of results) console.log(`  ${r.terrain.padEnd(10)} ${r.claimedLuma.toFixed(1)}`);

    await browser.close();
    if (anyFail) {
      console.error("\nreadability check FAILED — some terrain's claimed/unclaimed delta is under threshold.");
      process.exitCode = 1;
    } else {
      console.log("\nreadability check PASSED.");
    }
  } finally {
    devServer?.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
