import type { AxialCoord } from "@core/hex";
import { placeLabels, type Box, type LabelCandidate } from "./labelPlacement";

/**
 * Names floated over the board: monuments, and the localities a player from
 * Panjim will look for (Campal, Altinho, Fontainhas...).
 *
 * DOM, NOT 3D TEXT
 *
 * An absolutely positioned element over the canvas is crisp at every zoom,
 * costs nothing to load, inherits the HUD's typography and stays out of the
 * Three.js scene. The OSM raster underneath also prints names, but they are
 * baked into its pixels at the overlay's opacity and cannot be darkened on
 * their own; these are our own, in our own ink.
 *
 * NO LABEL EVER OVERLAPS ANOTHER, OR THE HUD, OR MAYA
 *
 * Every frame the labels are placed by `placeLabels` (labelPlacement.ts):
 * each tries its home position and a few fallbacks, and is not drawn at all
 * if none is free. Maya and every HUD panel are obstacles, so where a name
 * would touch them it is the name that goes. Monument cards outrank major
 * localities, which outrank minor ones; a label already showing keeps a small
 * advantage, so names do not blink as the camera moves. The obstacles'
 * rectangles are read every frame (the render loop has already laid the page
 * out by then), because Maya, the forecast label and the build menu move.
 * `tools/labelOverlapTest.ts` checks this in a browser at three window sizes,
 * on settled views and frame by frame while the camera pans and Maya hops.
 */
export interface MapLabel {
  name: string;
  q: number;
  r: number;
  /** "landmark": a monument or a named place on a map without localities (pill style). "locality": a neighbourhood name (map ink). */
  kind: "landmark" | "locality";
  /** 0 landmark, 1 major locality, 2 minor locality. */
  rank: 0 | 1 | 2;
}

/** Where a label's anchor tile currently sits on screen, in CSS pixels relative to the canvas. */
export type ProjectToScreen = (coord: AxialCoord) => { x: number; y: number; depth: number } | null;

/** Camera distance at which landmark cards are fully visible, and the distance past which they are gone. */
const LABEL_FADE_NEAR = 26;
const LABEL_FADE_FAR = 40;
/** Minor localities appear when the camera comes closer than the first distance and go when it pulls back past the second (no blinking at the threshold). */
const MINOR_LOCALITY_SHOW = 29.5;
const MINOR_LOCALITY_HIDE = 30.5;
/** A monument card is a candidate only once it is at least half faded in, so a near-invisible card does not hold space a locality could use. */
const LANDMARK_MIN_FADE = 0.5;

/**
 * Everything a label must keep clear of. Maya and the HUD sit above the map,
 * so a name that would touch one of them is dropped. A broad list on purpose:
 * a panel missing from it would let a name slide under it.
 */
export const LABEL_OBSTACLES = [
  ".maya-figure-wrap",
  ".maya-bubble",
  ".maya-badge",
  ".instrument-cluster",
  ".coin-jar",
  ".field-guide-button",
  ".panjim-clock",
  ".hud-chrome",
  ".houses-counter",
  ".panjim-toggles",
  ".objectives-panel",
  ".get-ready",
  ".nugget-badge",
  ".map-corner",
  ".map-layer-control",
  ".empty-prompt",
  ".era-banner",
  ".build-popover",
  ".hud-tooltip",
  ".field-guide-toast",
  ".aftermath-card",
  ".field-guide-card",
  ".finale-card",
  ".brief-card",
  ".replay-card",
  ".tutorial-coach",
  ".forecast-label",
  ".storm-card",
  ".hud-corner",
  ".help-card",
  ".storm-report",
  ".era-end-card",
  ".welcome-card",
  ".sources-panel",
  ".nugget-credit"
];

/** How often the list of HUD elements, and whether each is visible, is re-read (their rectangles are read every frame). */
const OBSTACLE_LIST_MS = 250;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface Entry {
  id: string;
  label: MapLabel;
  node: HTMLElement;
  w: number;
  h: number;
  /** For a locality named like a monument: that monument's entry id. */
  yieldsTo?: string;
}

/**
 * The labels a map shows: its monuments and localities when it has
 * localities; otherwise its landmarks as before (the Tutorial's sea, beach,
 * estuary, river and land). A locality named like a monument stays, and
 * gives way only in a frame where the monument's card is drawn (Dona Paula
 * keeps its name when zoomed out, where cards are not shown).
 */
export function labelsForMap(map: {
  landmarks: readonly { name: string; q: number; r: number }[];
  monuments: readonly { name: string; q: number; r: number }[];
  localities: readonly { name: string; q: number; r: number; rank: 1 | 2 }[];
}): MapLabel[] {
  if (map.localities.length === 0) return map.landmarks.map((l) => ({ name: l.name, q: l.q, r: l.r, kind: "landmark", rank: 0 }));
  return [
    ...map.monuments.map((m): MapLabel => ({ name: m.name, q: m.q, r: m.r, kind: "landmark", rank: 0 })),
    ...map.localities.map((l): MapLabel => ({ name: l.name, q: l.q, r: l.r, kind: "locality", rank: l.rank }))
  ];
}

export class MapLabelLayer {
  private readonly el: HTMLElement;
  private readonly entries: Entry[] = [];
  private visible = true;
  private measured = false;
  /** HUD elements that are obstacles and currently visible; refreshed every OBSTACLE_LIST_MS. */
  private obstacleEls: HTMLElement[] = [];
  private obstacleListAt = -Infinity;
  /** Whether minor localities are currently allowed (hysteresis on the zoom threshold). */
  private minorOn = false;
  /** Last frame's placements: id → offset used. */
  private previous = new Map<string, number>();
  private readonly sizeObserver: ResizeObserver | null;
  private readonly invalidate = (): void => {
    this.measured = false;
  };

  /** Set by the tests to fill `lastFrame`; off in play, so nothing is built for them every frame. */
  collectDebug = false;
  /** Last frame's candidates (name, anchor, size) and which were drawn, when `collectDebug` is on. */
  lastFrame: { name: string; x: number; y: number; w: number; h: number; drawn: boolean }[] = [];
  /** How long the last `update` took, in milliseconds. */
  lastCostMs = 0;
  /** Last frame's obstacle rectangles, in container pixels (for the tests). */
  obstacles: Box[] = [];

  constructor(private readonly container: HTMLElement, labels: readonly MapLabel[]) {
    this.el = document.createElement("div");
    this.el.className = "map-labels";
    // Decorative duplication of what the level brief already says in prose, so
    // it is skipped rather than read out as a list of bare place names.
    this.el.setAttribute("aria-hidden", "true");

    const monumentIds = new Map<string, string>();
    labels.forEach((label, index) => {
      const node = document.createElement("div");
      node.className = label.kind === "locality" ? `map-label locality rank-${label.rank}` : "map-label";
      node.textContent = label.name;
      this.el.appendChild(node);
      const id = `${index}:${label.name}`;
      if (label.kind === "landmark") monumentIds.set(label.name, id);
      this.entries.push({ id, label, node, w: 0, h: 0, yieldsTo: label.kind === "locality" ? monumentIds.get(label.name) : undefined });
    });

    container.appendChild(this.el);
    window.addEventListener("resize", this.invalidate);
    // A label's size changes when a web font arrives or its styles change: re-measure then.
    document.fonts?.addEventListener?.("loadingdone", this.invalidate);
    this.sizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(this.invalidate) : null;
    for (const entry of this.entries) this.sizeObserver?.observe(entry.node);
  }

  /** Hides every label — used while a hazard is resolving, when the board needs the player's whole attention. */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.el.hidden = !visible;
    if (!visible) this.previous.clear();
  }

  /** The names currently drawn, for the tests. */
  shownNames(): string[] {
    return this.entries.filter((e) => this.previous.has(e.id)).map((e) => e.label.name);
  }

  private measure(): void {
    for (const entry of this.entries) {
      entry.w = entry.node.offsetWidth;
      entry.h = entry.node.offsetHeight;
    }
    // One pass is enough: a label that measured 0 (laid out while hidden) is
    // skipped until the size observer reports it.
    this.measured = true;
  }

  /** The HUD's rectangles now. The element list and their visibility are re-read every OBSTACLE_LIST_MS; the rectangles every frame. */
  private readObstacles(nowMs: number): Box[] {
    if (nowMs - this.obstacleListAt >= OBSTACLE_LIST_MS) {
      this.obstacleListAt = nowMs;
      // The whole document: some panels (the Sources screen) live outside the game's container.
      this.obstacleEls = Array.from(document.querySelectorAll<HTMLElement>(LABEL_OBSTACLES.join(","))).filter((el) => {
        if (this.el.contains(el) || el.closest("[hidden]")) return false;
        const style = getComputedStyle(el);
        // Opacity is not tested: a panel fading in is already an obstacle.
        return style.display !== "none" && style.visibility !== "hidden";
      });
    }
    const origin = this.container.getBoundingClientRect();
    const boxes: Box[] = [];
    for (const el of this.obstacleEls) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      boxes.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    }
    return boxes;
  }

  /**
   * Places every label. Called once per frame from the render loop.
   *
   * `project` returns null for a tile behind the camera, which cannot happen
   * with this camera rig but is cheap to handle.
   */
  update(project: ProjectToScreen, viewportWidth: number, viewportHeight: number, cameraDistance: number): void {
    if (!this.visible) return;
    const started = performance.now();
    if (!this.measured) this.measure();
    this.obstacles = this.readObstacles(started);

    // Landmark cards fade with distance: pinned on at every zoom they would
    // stack over the buildings they name, which are the better label up close.
    const landmarkFade = clamp((LABEL_FADE_FAR - cameraDistance) / (LABEL_FADE_FAR - LABEL_FADE_NEAR), 0, 1);
    if (cameraDistance < MINOR_LOCALITY_SHOW) this.minorOn = true;
    else if (cameraDistance > MINOR_LOCALITY_HIDE) this.minorOn = false;

    const candidates: LabelCandidate[] = [];
    const byId = new Map<string, Entry>();
    for (const entry of this.entries) {
      const { label } = entry;
      if (entry.w < 1) continue;
      if (label.kind === "landmark" && landmarkFade < LANDMARK_MIN_FADE) continue;
      if (label.rank === 2 && !this.minorOn) continue;
      const screen = project({ q: label.q, r: label.r });
      if (!screen) continue;
      candidates.push({
        id: entry.id,
        priority: label.rank,
        anchorX: screen.x,
        anchorY: screen.y,
        w: entry.w,
        h: entry.h,
        // A locality sits on its point, over the raster's own faint copy of the name.
        centred: label.kind === "locality",
        yieldsTo: entry.yieldsTo
      });
      byId.set(entry.id, entry);
    }

    const placements = placeLabels(candidates, this.obstacles, { width: viewportWidth, height: viewportHeight }, this.previous);
    const next = new Map<string, number>();
    for (const p of placements) {
      next.set(p.id, p.offset);
      const entry = byId.get(p.id)!;
      entry.node.style.transform = `translate(${p.box.x.toFixed(1)}px, ${p.box.y.toFixed(1)}px)`;
      entry.node.style.opacity = entry.label.kind === "landmark" ? landmarkFade.toFixed(2) : "1";
      entry.node.classList.add("shown");
    }
    for (const entry of this.entries) {
      if (!next.has(entry.id)) entry.node.classList.remove("shown");
    }
    this.previous = next;
    this.lastCostMs = performance.now() - started;
    if (this.collectDebug) {
      this.lastFrame = candidates.map((c) => ({ name: byId.get(c.id)!.label.name, x: Math.round(c.anchorX), y: Math.round(c.anchorY), w: c.w, h: c.h, drawn: next.has(c.id) }));
    }
  }

  dispose(): void {
    window.removeEventListener("resize", this.invalidate);
    document.fonts?.removeEventListener?.("loadingdone", this.invalidate);
    this.sizeObserver?.disconnect();
    this.el.remove();
  }
}
