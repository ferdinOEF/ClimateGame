/**
 * Where Maya and her speech bubble may stand: pure rectangle geometry, so
 * the rules are unit-tested without a browser.
 *
 * The rule is simple and absolute: neither her figure nor her bubble may
 * overlap any other HUD element (with `CLEARANCE` px to spare) or leave the
 * viewport. The session hands in the rectangles of everything on screen
 * (the Discovery card, Get ready, the top bar, the build menu, tooltips,
 * cards); these functions find the nearest free spot.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CLEARANCE = 12;

export function intersects(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

export function inside(r: Rect, viewport: { w: number; h: number }, pad = 0): boolean {
  return r.x >= pad && r.y >= pad && r.x + r.w <= viewport.w - pad && r.y + r.h <= viewport.h - pad;
}

function free(r: Rect, obstacles: readonly Rect[], viewport: { w: number; h: number }, clearance: number): boolean {
  return inside(r, viewport, Math.min(clearance, 8)) && obstacles.every((o) => !intersects(r, o, clearance));
}

/**
 * Her figure's spot.
 *
 * Docked (`target` null): the left edge, searched from the bottom up, so she
 * stands just above whatever holds the bottom-left corner (the Discovery
 * card, the street-map switch) and moves with it; failing that, along the
 * bottom edge; failing that, anywhere free.
 *
 * Away (`target` a point on the board): her feet as near that point as a
 * free spot allows, searching outward ring by ring.
 */
export function placeFigure(
  size: { w: number; h: number },
  obstacles: readonly Rect[],
  viewport: { w: number; h: number },
  target: { x: number; y: number } | null,
  clearance = CLEARANCE
): Rect | null {
  const at = (x: number, y: number): Rect => ({ x: Math.round(x), y: Math.round(y), w: size.w, h: size.h });
  if (target) {
    const base = at(target.x - size.w / 2, target.y - size.h);
    if (free(base, obstacles, viewport, clearance)) return base;
    for (let radius = 16; radius <= Math.max(viewport.w, viewport.h); radius += 16) {
      const steps = Math.max(8, Math.round(radius / 10));
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const r = at(base.x + Math.cos(angle) * radius, base.y + Math.sin(angle) * radius);
        if (free(r, obstacles, viewport, clearance)) return r;
      }
    }
    return null;
  }
  const left = clearance;
  for (let y = viewport.h - size.h - clearance; y >= clearance; y -= 8) {
    const r = at(left, y);
    if (free(r, obstacles, viewport, clearance)) return r;
  }
  for (let x = clearance; x <= viewport.w - size.w - clearance; x += 12) {
    const r = at(x, viewport.h - size.h - clearance);
    if (free(r, obstacles, viewport, clearance)) return r;
  }
  for (let y = viewport.h - size.h - clearance; y >= clearance; y -= 16) {
    for (let x = clearance; x <= viewport.w - size.w - clearance; x += 16) {
      const r = at(x, y);
      if (free(r, obstacles, viewport, clearance)) return r;
    }
  }
  return null;
}

export type BubbleSide = "right" | "above" | "left";

/**
 * Her bubble's spot, beside her figure and toward free space: to her right
 * first (level with her head), then above her, then to her left; each at a
 * few heights. `measure(width)` gives the bubble's height at a width, since
 * text reflows. Widths are tried from `maxWidth` down to 220 px. Null if
 * nothing fits: the caller shrinks the text or holds the line back.
 */
export function placeBubble(
  figure: Rect,
  measure: (width: number) => number,
  obstacles: readonly Rect[],
  viewport: { w: number; h: number },
  maxWidth = 320,
  clearance = CLEARANCE
): { rect: Rect; side: BubbleSide } | null {
  const gap = 8;
  for (const width of [maxWidth, 280, 250, 220].filter((w) => w <= maxWidth)) {
    const h = measure(width);
    const headY = figure.y + figure.h * 0.15;
    const candidates: { rect: Rect; side: BubbleSide }[] = [];
    for (const dy of [0, -h * 0.5, -h, h * 0.4, -h * 1.5]) {
      candidates.push({ side: "right", rect: { x: figure.x + figure.w + gap, y: headY + dy, w: width, h } });
    }
    for (const dx of [0, -width * 0.5, figure.w - width, -width + figure.w * 0.5]) {
      candidates.push({ side: "above", rect: { x: figure.x + dx, y: figure.y - gap - h, w: width, h } });
    }
    for (const dy of [0, -h * 0.5, -h]) {
      candidates.push({ side: "left", rect: { x: figure.x - gap - width, y: headY + dy, w: width, h } });
    }
    for (const c of candidates) {
      const rect = { x: Math.round(c.rect.x), y: Math.round(c.rect.y), w: c.rect.w, h: Math.round(c.rect.h) };
      // The bubble must clear the HUD; it may sit right next to her own figure.
      if (free(rect, obstacles, viewport, clearance) && !intersects(rect, figure)) return { rect, side: c.side };
    }
  }
  return null;
}
