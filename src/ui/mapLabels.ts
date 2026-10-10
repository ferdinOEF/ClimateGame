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
 * advantage, so names do not blink as the camera moves.
 * `tools/labelOverlapTest.ts` checks this in a browser at three window sizes.
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
/** Minor localities appear only when the camera is closer than this. */
const MINOR_LOCALITY_DISTANCE = 30;

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
  ".hud-corner"
];

/** How often the HUD's rectangles are re-read, in milliseconds (reading them every frame would force layout). */
const OBSTACLE_REFRESH_MS = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface Entry {
  id: string;
  label: MapLabel;
  node: HTMLElement;
  w: number;
  h: number;
}

/**
 * The labels a map shows: its monuments and localities when it has
 * localities; otherwise its landmarks as before (the Tutorial's sea, beach,
 * estuary, river and land). A locality that shares a name with a monument is
 * left to the monument.
 */
export function labelsForMap(map: {
  landmarks: readonly { name: string; q: number; r: number }[];
  monuments: readonly { name: string; q: number; r: number }[];
  localities: readonly { name: string; q: number; r: number; rank: 1 | 2 }[];
}): MapLabel[] {
  if (map.localities.length === 0) return map.landmarks.map((l) => ({ name: l.name, q: l.q, r: l.r, kind: "landmark", rank: 0 }));
  const monumentNames = new Set(map.monuments.map((m) => m.name));
  return [
    ...map.monuments.map((m): MapLabel => ({ name: m.name, q: m.q, r: m.r, kind: "landmark", rank: 0 })),
    ...map.localities.filter((l) => !monumentNames.has(l.name)).map((l): MapLabel => ({ name: l.name, q: l.q, r: l.r, kind: "locality", rank: l.rank }))
  ];
}

export class MapLabelLayer {
  private readonly el: HTMLElement;
  private readonly entries: Entry[] = [];
  private visible = true;
  private measured = false;
  private obstacles: Box[] = [];
  private obstaclesAt = -Infinity;
  /** Last frame's placements: id → offset used. */
  private previous = new Map<string, number>();
  private readonly onResize = (): void => {
    this.measured = false;
    this.obstaclesAt = -Infinity;
  };

  constructor(private readonly container: HTMLElement, labels: readonly MapLabel[]) {
    this.el = document.createElement("div");
    this.el.className = "map-labels";
    // Decorative duplication of what the level brief already says in prose, so
    // it is skipped rather than read out as a list of bare place names.
    this.el.setAttribute("aria-hidden", "true");

    labels.forEach((label, index) => {
      const node = document.createElement("div");
      node.className = label.kind === "locality" ? `map-label locality rank-${label.rank}` : "map-label";
      node.textContent = label.name;
      this.el.appendChild(node);
      this.entries.push({ id: `${index}:${label.name}`, label, node, w: 0, h: 0 });
    });

    container.appendChild(this.el);
    window.addEventListener("resize", this.onResize);
    // Web fonts change label widths once they load.
    void document.fonts?.ready.then(() => this.onResize());
  }

  /** Hides every label — used while a hazard is resolving, when the board needs the player's whole attention. */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.el.hidden = !visible;
    if (!visible) this.previous.clear();
  }

  /** Last frame's candidates (name, anchor, size) and which were drawn, for the tests. */
  lastFrame: { name: string; x: number; y: number; w: number; h: number; drawn: boolean }[] = [];

  /** How long the last `update` took, in milliseconds (the perf check reads it). */
  lastCostMs = 0;

  /** The names currently drawn, for the tests. */
  shownNames(): string[] {
    return this.entries.filter((e) => this.previous.has(e.id)).map((e) => e.label.name);
  }

  private measure(): void {
    for (const entry of this.entries) {
      entry.w = entry.node.offsetWidth;
      entry.h = entry.node.offsetHeight;
    }
    this.measured = this.entries.every((e) => e.w > 0) || this.entries.length === 0;
  }

  private readObstacles(nowMs: number): void {
    if (nowMs - this.obstaclesAt < OBSTACLE_REFRESH_MS) return;
    this.obstaclesAt = nowMs;
    const origin = this.container.getBoundingClientRect();
    const boxes: Box[] = [];
    for (const el of Array.from(this.container.querySelectorAll<HTMLElement>(LABEL_OBSTACLES.join(",")))) {
      if (el.closest("[hidden]") || this.el.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      boxes.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    }
    this.obstacles = boxes;
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
    this.readObstacles(performance.now());

    // Landmark cards fade with distance: pinned on at every zoom they would
    // stack over the buildings they name, which are the better label up close.
    const landmarkFade = clamp((LABEL_FADE_FAR - cameraDistance) / (LABEL_FADE_FAR - LABEL_FADE_NEAR), 0, 1);

    const candidates: LabelCandidate[] = [];
    const byId = new Map<string, Entry>();
    for (const entry of this.entries) {
      const { label } = entry;
      if (label.kind === "landmark" && landmarkFade <= 0) continue;
      if (label.rank === 2 && cameraDistance > MINOR_LOCALITY_DISTANCE) continue;
      const screen = project({ q: label.q, r: label.r });
      if (!screen) continue;
      candidates.push({ id: entry.id, priority: label.rank, anchorX: screen.x, anchorY: screen.y, w: entry.w, h: entry.h });
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
    this.lastFrame = candidates.map((c) => ({ name: byId.get(c.id)!.label.name, x: Math.round(c.anchorX), y: Math.round(c.anchorY), w: c.w, h: c.h, drawn: next.has(c.id) }));
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.el.remove();
  }
}
