import type { AxialCoord } from "@core/hex";

/**
 * Place names floated over the board.
 *
 * Without these, a map of Panaji is a pretty arrangement of coloured hexes that
 * the player has no reason to connect to anywhere. With them, the sand on the
 * west edge says "Miramar Beach" and the headland in the south-west says "Dona
 * Paula", and the thing the game is actually about — that this is a real place
 * with a real coast to lose — becomes visible rather than merely claimed in
 * the level brief.
 *
 * DOM, NOT 3D TEXT
 *
 * Three ways to put a word on a hex: a texture atlas, extruded geometry, or an
 * absolutely positioned element over the canvas. The first two cost a font
 * pipeline and render blurry at the zoom levels this camera uses; the third is
 * crisp at every zoom, costs nothing to load, inherits the HUD's typography
 * for free, and is readable by a screen reader. The only thing it costs is a
 * screen-space projection per label per frame, and there are sixteen labels.
 *
 * WHY THEY FADE RATHER THAN TOGGLE
 *
 * A label that pops in and out as the camera moves is worse than no label.
 * These fade on three things — distance from the screen edge, whether a hazard
 * is sweeping, and how far back the camera is — so panning and zooming reveal
 * names smoothly rather than flickering them.
 */

export interface MapLabel {
  name: string;
  q: number;
  r: number;
}

/** Where a label's anchor tile currently sits on screen, in CSS pixels relative to the canvas. */
export type ProjectToScreen = (coord: AxialCoord) => { x: number; y: number; depth: number } | null;

/** Camera distance at which labels are fully visible, and the distance past which they are gone. */
const LABEL_FADE_NEAR = 26;
const LABEL_FADE_FAR = 40;

/** Three's `MathUtils.clamp`, rewritten rather than imported — this module is DOM-only and has no other reason to pull in Three. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class MapLabelLayer {
  private readonly el: HTMLElement;
  private readonly entries: { label: MapLabel; node: HTMLElement }[] = [];
  private visible = true;
  /** True once every label has been hidden by zoom, so the fade-out writes styles once rather than every frame. */
  private fadedOut = false;

  constructor(container: HTMLElement, labels: readonly MapLabel[]) {
    this.el = document.createElement("div");
    this.el.className = "map-labels";
    // Decorative duplication of what the level brief already says in prose, so
    // it is skipped rather than read out as a list of bare place names.
    this.el.setAttribute("aria-hidden", "true");

    for (const label of labels) {
      const node = document.createElement("div");
      node.className = "map-label";
      node.textContent = label.name;
      this.el.appendChild(node);
      this.entries.push({ label, node });
    }

    container.appendChild(this.el);
  }

  /** Hides every label — used while a hazard is resolving, when the board needs the player's whole attention. */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.el.hidden = !visible;
  }

  /**
   * Repositions every label. Called once per frame from the render loop.
   *
   * `project` returns null for a tile behind the camera, which cannot happen
   * with this camera rig but is cheap to handle and means a future free-orbit
   * camera does not put labels on the wrong side of the world.
   */
  update(project: ProjectToScreen, viewportWidth: number, viewportHeight: number, cameraDistance: number): void {
    if (!this.visible) return;

    /*
     * Labels fade out as the camera pulls back.
     *
     * Panaji carries sixteen of them. Pinned on at every zoom they overlap
     * into an unreadable stack the moment the whole board is on screen, and
     * they cover the buildings they are naming — which is backwards, because
     * the buildings themselves are the better label once you are close enough
     * to see them. Below `LABEL_FADE_NEAR` they are fully on; past
     * `LABEL_FADE_FAR` they are gone and the board is just a board.
     */
    const zoomFade = clamp(
      (LABEL_FADE_FAR - cameraDistance) / (LABEL_FADE_FAR - LABEL_FADE_NEAR),
      0,
      1
    );
    if (zoomFade <= 0) {
      if (!this.fadedOut) {
        for (const { node } of this.entries) node.style.opacity = "0";
        this.fadedOut = true;
      }
      return;
    }
    this.fadedOut = false;

    for (const { label, node } of this.entries) {
      const screen = project({ q: label.q, r: label.r });
      if (!screen) {
        node.style.opacity = "0";
        continue;
      }

      // A margin rather than a hard viewport test: a label whose anchor is
      // just off-screen should still be drawn, partly clipped, because its
      // text extends inward. Cutting at exactly the edge makes names vanish
      // while still half visible.
      const margin = 80;
      const onScreen =
        screen.x > -margin && screen.x < viewportWidth + margin && screen.y > -margin && screen.y < viewportHeight + margin;
      if (!onScreen) {
        node.style.opacity = "0";
        continue;
      }

      node.style.transform = `translate(-50%, -100%) translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px)`;

      // Fade out as a label approaches the edge, so panning reveals names
      // rather than flicking them on. 1 at the centre two-thirds, falling to 0
      // over the outer sixth.
      const edgeFade = Math.min(
        1,
        Math.min(screen.x, viewportWidth - screen.x) / (viewportWidth * 0.14),
        Math.min(screen.y, viewportHeight - screen.y) / (viewportHeight * 0.14)
      );
      node.style.opacity = (Math.max(0, Math.min(1, edgeFade)) * zoomFade).toFixed(2);
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
