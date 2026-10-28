/**
 * Section 34b (owner, 28 October): the cyclone ring's painting, on its own so the bake tool
 * (`tools/bakeStormRings.ts`) paints the very same pixels in a browser that has the canvas blur and saves them as
 * `public/art/storm-ring-<seed>.png`. A browser whose 2D canvas has no `filter` (older Safari) loads those files
 * instead, so the rings look the same there.
 *
 * Self-contained on purpose (its random numbers inside it, nothing from outside): the bake tool hands the function
 * itself to the browser page.
 */
export function paintRing(g: CanvasRenderingContext2D, seed: number, size: number, ringAt: number): void {
  let s = seed >>> 0;
  const random = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const c = size / 2;
  const radius = c * ringAt;
  // Blurred: the ring's edges soft, no disc reads.
  g.filter = "blur(6px)";
  const clumps = 26;
  for (let k = 0; k < clumps; k++) {
    const a = (k / clumps) * Math.PI * 2 + random() * 0.2;
    const r = radius * (0.92 + random() * 0.16);
    const blob = c * (0.16 + random() * 0.12);
    const alpha = 0.35 + random() * 0.55;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    const grad = g.createRadialGradient(x, y, 0, x, y, blob);
    grad.addColorStop(0, `rgba(238, 242, 245, ${alpha.toFixed(2)})`);
    grad.addColorStop(1, "rgba(238, 242, 245, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, blob, 0, Math.PI * 2);
    g.fill();
  }
}

/** The ring sheets' canvas size, in pixels (the baked files are this size too). */
export const RING_TEXTURE_SIZE = 256;

/** Whether this browser's 2D canvas has the `filter` the painting's blur needs. */
export function canvasBlurWorks(): boolean {
  return typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
}

/** The baked, pre-blurred ring for a seed, under the site's base path. */
export function bakedRingUrl(seed: number, base: string): string {
  return `${base}art/storm-ring-${seed}.png`;
}
