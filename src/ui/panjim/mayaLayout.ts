/**
 * Where Maya and her speech bubble stand: pure rectangle geometry, so the
 * rules are unit-tested without a browser.
 *
 * She never moves. Her figure has one fixed home, the bottom-left corner of
 * the screen (Section 34c.2, the owner; Section 33b had the bottom right), a `HOME_MARGIN` in from both edges; it is the same
 * on every frame and in every state, and if something else would cover it,
 * that other element moves, not her.
 *
 * Her bubble is the only thing that is placed. It goes beside her figure
 * (to her right, else above her) and clear of every other HUD element by
 * `CLEARANCE` px; the session hands in the rectangles of everything on
 * screen (the HUD card, the hint, the build menu, tooltips, cards)
 * and this finds the nearest free spot, or says there is none and the line
 * waits.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CLEARANCE = 12;

/**
 * How big the whole field guide is: her figure, speech bubble, Got-it button,
 * minimise button and badge, as one entity. Every size of hers comes from this
 * one number (the CSS reads it as `--maya-scale`, set by maya.ts), so changing
 * it resizes all of her together. The space she keeps from other HUD elements
 * (`CLEARANCE`) does not scale.
 */
export const MAYA_SCALE = 0.315;

/** A size of hers (in px), at her scale. */
export function scaled(px: number): number {
  return Math.round(px * MAYA_SCALE);
}

/**
 * What does not shrink with her. Her text never goes under 12 px, so her
 * bubble keeps a width that text can wrap in; her badge and minimise button
 * stay big enough to hit. Everything else about her box is a multiple of
 * MAYA_SCALE.
 */
export const BUBBLE_MIN_WIDTH = 190;
export const BADGE_MIN_PX = 30;
export const MINIMISE_MIN_PX = 14;

/** Her badge and minimise button, in px (the CSS reads them as `--maya-badge` and `--maya-minimise`). */
export const BADGE_PX = Math.max(BADGE_MIN_PX, scaled(52));
export const MINIMISE_PX = Math.max(MINIMISE_MIN_PX, scaled(22));

/** Her home: how far her figure (or her badge) stands from the left and the bottom edge of the screen, in whole pixels. */
export const HOME_MARGIN = 12;

/** The widths her bubble is tried at, widest first: her scaled widths, none narrower than the text can use. */
export function bubbleWidths(maxWidth = 320): number[] {
  const widths = [maxWidth, 280, 250, 220].filter((w) => w <= maxWidth).map((w) => Math.max(BUBBLE_MIN_WIDTH, scaled(w)));
  return widths.filter((w, i) => widths.indexOf(w) === i);
}

/**
 * The screen-size step: a little bigger on big screens, smaller in a short
 * or narrow window (the same steps the HUD's own media queries make).
 */
export function screenTier(viewport: { w: number; h: number }): number {
  if (viewport.w <= 700) return 0.68;
  if (viewport.w >= 1700 && viewport.h >= 900) return 1.17;
  if (viewport.h <= 700) return 0.82;
  return 1;
}

/**
 * Her figure's box for a crop `view` (art units) drawn at `unitPx` px per
 * unit: the width at her scale and the screen's tier, the height from the
 * crop's aspect ratio. Whole pixels, so she is never drawn between them.
 */
export function figureSize(view: { width: number; height: number }, unitPx: number, tier = 1): { w: number; h: number } {
  const w = Math.round(view.width * unitPx * MAYA_SCALE * tier);
  return { w, h: Math.round((w * view.height) / view.width) };
}

/**
 * Her home: the box of a figure (or badge) of `size`, at the bottom-left of
 * the screen. The one place she ever stands.
 */
export function homeRect(size: { w: number; h: number }, viewport: { w: number; h: number }): Rect {
  return { x: HOME_MARGIN, y: Math.round(viewport.h) - size.h - HOME_MARGIN, w: size.w, h: size.h };
}

export function intersects(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

export function inside(r: Rect, viewport: { w: number; h: number }, pad = 0): boolean {
  return r.x >= pad && r.y >= pad && r.x + r.w <= viewport.w - pad && r.y + r.h <= viewport.h - pad;
}

function free(r: Rect, obstacles: readonly Rect[], viewport: { w: number; h: number }, clearance: number): boolean {
  return inside(r, viewport, Math.min(clearance, 8)) && obstacles.every((o) => !intersects(r, o, clearance));
}

export type BubbleSide = "right" | "above";

/**
 * Her bubble's spot, beside her figure and toward free space: to her right
 * first (level with her head), then above her; each at a few heights.
 * `measure(width)` gives the bubble's height at a width, since text reflows.
 * Widths (`maxWidth` is in unscaled px) come from `bubbleWidths`, widest first.
 * Null if nothing fits: the caller tries a more compact bubble, then holds the
 * line back until something moves. The figure is never the thing that gives way.
 */
export function placeBubble(
  figure: Rect,
  measure: (width: number) => number,
  obstacles: readonly Rect[],
  viewport: { w: number; h: number },
  maxWidth = 320,
  clearance = CLEARANCE
): { rect: Rect; side: BubbleSide } | null {
  const gap = scaled(8);
  for (const width of bubbleWidths(maxWidth)) {
    const h = measure(width);
    const headY = figure.y + figure.h * 0.15;
    const candidates: { rect: Rect; side: BubbleSide }[] = [];
    for (const dy of [0, -h * 0.5, -h, h * 0.4, -h * 1.5]) {
      candidates.push({ side: "right", rect: { x: figure.x + figure.w + gap, y: headY + dy, w: width, h } });
    }
    // Above her: its left edge at hers first (the tail over her head), then the same spots as the right corner had, mirrored.
    for (const dx of [0, -width * 0.5, figure.w - width, figure.w * 0.5]) {
      candidates.push({ side: "above", rect: { x: figure.x + dx, y: figure.y - gap - h, w: width, h } });
    }
    for (const c of candidates) {
      const rect = { x: Math.round(c.rect.x), y: Math.round(c.rect.y), w: c.rect.w, h: Math.round(c.rect.h) };
      // The bubble must clear the HUD; it may sit right next to her own figure.
      if (free(rect, obstacles, viewport, clearance) && !intersects(rect, figure)) return { rect, side: c.side };
    }
  }
  return null;
}
