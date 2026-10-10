/**
 * Where each map label goes, or whether it goes at all. Pure: boxes in, boxes
 * out, no DOM, so the rule can be tested on its own (tests/labelPlacement.test.ts).
 *
 * THE RULE
 *
 * A label is tried at its home position and then at a few fallback offsets.
 * The first position that is fully on screen and touches nothing already
 * placed, and no obstacle (Maya, every HUD panel), wins. If none is free the
 * label is not drawn at all: never shrunk, never overlapping, never half
 * covered. A dropped label is correct behaviour.
 *
 * Labels are resolved in a fixed order, so the same ones survive from frame to
 * frame: by class (monument cards first, then major localities, then minor
 * ones), then labels already showing before ones that are not (a small
 * advantage, so a name does not blink as the camera drifts), then by their
 * order in the data. A label that is showing also tries its last position
 * first, so it does not jump between offsets, and is allowed a couple of
 * pixels less clearance than a newcomer, so a sub-pixel drift of the camera
 * near an edge or a panel does not make it blink. It never overlaps: the
 * clearance shrinks, not to below zero.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelCandidate {
  id: string;
  /** Lower goes first: 0 monument cards, 1 major localities, 2 minor localities. */
  priority: number;
  /** The point the label names, in screen pixels. */
  anchorX: number;
  anchorY: number;
  w: number;
  h: number;
  /** Home is centred on the anchor rather than above it (a locality covers the raster's own copy of its name). */
  centred?: boolean;
  /** Not drawn when this other label is (a locality named like a monument whose card is showing). */
  yieldsTo?: string;
}

export interface Placement {
  id: string;
  box: Box;
  /** Which offset was used (0 is home), so the next frame can prefer it. */
  offset: number;
}

/** Gap kept between two labels, and between a label and an obstacle, in pixels. */
export const LABEL_GAP = 4;
/** Space kept from the window's edge. */
export const EDGE_MARGIN = 4;
/** How much less clearance a label already showing needs (hysteresis); never below zero. */
export const SHOWN_SLACK = 2;

/** The home box (centred above the anchor) and the fallbacks, in order. */
export function candidateBoxes(c: LabelCandidate): Box[] {
  const { anchorX: x, anchorY: y, w, h } = c;
  return [
    { x: x - w / 2, y: c.centred ? y - h / 2 : y - h, w, h }, // home: centred above its point (or on it)
    { x: x - w / 2, y: y + 6, w, h }, // below
    { x: x + 8, y: y - h / 2, w, h }, // right
    { x: x - w - 8, y: y - h / 2, w, h }, // left
    { x: x - w / 2, y: y - 2 * h - 6, w, h } // higher
  ];
}

export function overlaps(a: Box, b: Box, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function inside(box: Box, width: number, height: number, margin: number): boolean {
  return box.x >= margin && box.y >= margin && box.x + box.w <= width - margin && box.y + box.h <= height - margin;
}

/**
 * Places what fits. `previous` is last frame's result (id → offset), for the
 * advantage given to labels already showing.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  obstacles: readonly Box[],
  viewport: { width: number; height: number },
  previous: ReadonlyMap<string, number> = new Map()
): Placement[] {
  const order = candidates
    .map((c, index) => ({ c, index }))
    .sort((a, b) => {
      if (a.c.priority !== b.c.priority) return a.c.priority - b.c.priority;
      const shownA = previous.has(a.c.id) ? 0 : 1;
      const shownB = previous.has(b.c.id) ? 0 : 1;
      if (shownA !== shownB) return shownA - shownB;
      return a.index - b.index;
    });
  const placed: Placement[] = [];
  for (const { c } of order) {
    if (c.yieldsTo && placed.some((p) => p.id === c.yieldsTo)) continue;
    const shown = previous.has(c.id);
    const gap = shown ? LABEL_GAP - SHOWN_SLACK : LABEL_GAP;
    const margin = shown ? EDGE_MARGIN - SHOWN_SLACK : EDGE_MARGIN;
    const boxes = candidateBoxes(c);
    const last = previous.get(c.id);
    const tries = last !== undefined && last < boxes.length ? [last, ...boxes.keys()].filter((v, i, all) => all.indexOf(v) === i) : [...boxes.keys()];
    for (const offset of tries) {
      const box = boxes[offset];
      if (!inside(box, viewport.width, viewport.height, margin)) continue;
      if (obstacles.some((o) => overlaps(box, o, gap))) continue;
      if (placed.some((p) => overlaps(box, p.box, gap))) continue;
      placed.push({ id: c.id, box, offset });
      break;
    }
  }
  return placed;
}
