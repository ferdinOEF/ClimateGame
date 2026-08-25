import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { createHexPrismGeometry } from "./hexGeometry";
import { SettleAnimator } from "./settleAnimation";

const MAX_INSTANCES = 400;
const OVERLAY_HEIGHT = 0.14;
const OVERLAY_LIFETIME_MS = 2200;

export type HazardKind = "flood" | "storm";

export interface HazardOverlayColors {
  shallow: string;
  deep: string;
}

/** Flood: pale shin-deep splash to a dark, saturated inundation. */
export const FLOOD_OVERLAY_COLORS: HazardOverlayColors = { shallow: "#8fbfd6", deep: "#0d3752" };
/** Storm Surge Wave (Section 0: display name only — the render layer's own `"storm"` kind label, decoupled from hazard.ts's internal "cyclone" id): wind-swept dust/debris tan to a bruised storm gray — visibly not water. */
export const CYCLONE_OVERLAY_COLORS: HazardOverlayColors = { shallow: "#d8c9a3", deep: "#4a4550" };
/**
 * STEP_PROMPT_hazard_science.md Section 6, porting khazan_hazard_prototype.
 * html's COMPOUND_COLOR technique: a third, distinct color used only when a
 * Flood and a Storm Surge Wave are BOTH currently visible on the same tile
 * — the direct visual expression of "this spot is taking a compound hit,"
 * not just two independent discs happening to sit in the same place.
 */
const COMPOUND_OVERLAY_COLOR = new THREE.Color("#c9503a");
/**
 * STEP_PROMPT_pacing_telegraph_preview.md Section 3: one consistent
 * "this is a hypothetical preview" color regardless of hazard kind —
 * deliberately unlike either real palette (flood's blue-to-dark-blue,
 * storm's tan-to-gray) so a preview tile can never be mistaken for a real
 * damage reveal mid-fade, even briefly.
 */
const PREVIEW_OVERLAY_COLOR = new THREE.Color("#7fe0ff");
const PREVIEW_PULSE_HEIGHT = 0.04;
const PREVIEW_PULSE_PERIOD_MS = 900;

interface ActiveOverlay {
  kind: HazardKind;
  index: number;
  expiresAtMs: number;
}

/**
 * Visible hazard resolution (Section 2/9's non-negotiable: the event must be
 * seen on the map, not just reflected in meter numbers). A translucent disc
 * appears on each damaged tile — both its height *and* its color saturation
 * scale with how much damage it took, so light damage reads differently
 * from severe damage at a glance — then it recedes and fades.
 *
 * STEP_PROMPT_hazard_science.md Section 6: ONE manager handles both hazard
 * kinds (not a separate instance per type, as before) so it can tell
 * whether a tile is CURRENTLY showing the *other* kind's overlay and blend
 * to a genuine compound color instead of two unaware discs — see `show()`.
 * `InstancedMesh` shares one material across every instance, so there's no
 * per-instance opacity to drive an envelope-style fade with directly (the
 * technique `khazan_hazard_prototype.html` uses, one material per tile);
 * the reveal/recede motion instead reuses this project's existing
 * `SettleAnimator` grow-in/shrink-out animation, the same mechanism every
 * other placed-object animation here already relies on.
 */
export class HazardOverlayManager {
  readonly mesh: THREE.InstancedMesh;
  /** High-water mark — only ever grows, capped at MAX_INSTANCES. */
  private nextIndex = 0;
  /** Indices whose collapse timeout has fired, ready to be reused. */
  private freeIndices: number[] = [];
  /** Bumped by reset() so any pending collapse setTimeout from the prior era's overlays knows its slot was already reclaimed wholesale. */
  private generation = 0;
  private animator = new SettleAnimator();
  private flood: { shallow: THREE.Color; deep: THREE.Color };
  private storm: { shallow: THREE.Color; deep: THREE.Color };
  private activeByKey = new Map<string, ActiveOverlay>();
  /**
   * STEP_PROMPT_pacing_telegraph_preview.md Section 3: preview tiles
   * share this mesh/index pool with real reveals (so combined capacity is
   * still bounded by MAX_INSTANCES) but are tracked entirely separately —
   * no SettleAnimator grow-in/collapse (a preview should appear/update
   * instantly, not drop-and-settle), no `OVERLAY_LIFETIME_MS` expiry (a
   * preview persists exactly as long as the toggle is on), no compound-
   * color blending with real overlays (a preview is hypothetical, it
   * shouldn't visually merge with something actually happening).
   */
  private previewByKey = new Map<string, { index: number; x: number; z: number; baseY: number }>();

  constructor(floodColors: HazardOverlayColors, stormColors: HazardOverlayColors) {
    this.flood = { shallow: new THREE.Color(floodColors.shallow), deep: new THREE.Color(floodColors.deep) };
    this.storm = { shallow: new THREE.Color(stormColors.shallow), deep: new THREE.Color(stormColors.deep) };

    const geometry = createHexPrismGeometry(0.9, OVERLAY_HEIGHT);
    const material = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.68,
      roughness: 0.3,
      metalness: 0.1
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 3), 3);
    this.mesh.count = 0;
    this.mesh.name = "hazard-overlay";
  }

  /**
   * Shows an overlay on `coord` for `kind`, sized and colored by
   * `severity`, that recedes after ~2s. If the *other* kind is still
   * currently showing on this same tile (both fresh within their own
   * ~2s lifetime), both instances blend to `COMPOUND_OVERLAY_COLOR` —
   * the compound event genuinely visible, not just present in the
   * underlying damage numbers.
   *
   * STEP_PROMPT_gameplay_stability_test.md Part A: the instance index used
   * to be a strictly-increasing counter that never gave back a slot once
   * its ~2s lifetime expired, so `show()` silently stopped doing anything
   * at all — no error, just no more overlays — after MAX_INSTANCES (400)
   * cumulative calls within a single era, easily hit by a handful of
   * hazard triggers on a well-populated map. Now draws from `freeIndices`
   * (populated once a shown overlay's own collapse timeout fires) before
   * growing `nextIndex`, so a long-expired overlay's slot is reusable.
   */
  show(kind: HazardKind, coord: AxialCoord, terrainTopY: number, severity: number, nowMs: number): void {
    let index: number;
    if (this.freeIndices.length > 0) {
      index = this.freeIndices.pop()!;
    } else if (this.nextIndex < MAX_INSTANCES) {
      index = this.nextIndex++;
    } else {
      return; // truly MAX_INSTANCES concurrently live at once — vanishingly unlikely, same bail as before
    }
    this.mesh.count = Math.max(this.mesh.count, index + 1);
    const key = `${coord.q},${coord.r}`;

    const { x, z } = axialToWorld(coord, 1.0);
    const intensity = THREE.MathUtils.clamp(severity / 1.6, 0, 1);
    const peakY = terrainTopY + 0.06 + intensity * 0.44;
    this.animator.begin(this.mesh, index, x, z, peakY, nowMs);

    const other = this.activeByKey.get(key);
    const compound = other !== undefined && other.kind !== kind && other.expiresAtMs > nowMs;
    const palette = kind === "flood" ? this.flood : this.storm;
    const color = compound ? COMPOUND_OVERLAY_COLOR : palette.shallow.clone().lerp(palette.deep, intensity);
    this.mesh.setColorAt(index, color);
    if (compound) this.mesh.setColorAt(other!.index, COMPOUND_OVERLAY_COLOR); // re-color the still-visible other disc too, so both read as compound
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    const expiresAtMs = nowMs + OVERLAY_LIFETIME_MS;
    this.activeByKey.set(key, { kind, index, expiresAtMs });

    // Captured so a reset() (era end) between now and this timeout firing
    // can tell this callback its slot was already reclaimed wholesale —
    // otherwise a stale collapse could double-free an index reset() already
    // handed out to a brand new era's overlay, corrupting it visually.
    const myGeneration = this.generation;
    setTimeout(() => {
      if (myGeneration !== this.generation) return;
      this.animator.collapse(this.mesh, index, x, peakY, z, performance.now());
      if (this.activeByKey.get(key)?.index === index) this.activeByKey.delete(key);
      this.freeIndices.push(index);
    }, OVERLAY_LIFETIME_MS);
  }

  /** Clears all overlays instantly (e.g. starting a fresh hazard event). */
  reset(): void {
    this.generation++;
    this.nextIndex = 0;
    this.freeIndices = [];
    this.mesh.count = 0;
    this.activeByKey.clear();
    this.clearPreview();
  }

  /**
   * STEP_PROMPT_pacing_telegraph_preview.md Section 3: shows (or
   * updates, if this tile already has a preview showing) a ghost overlay
   * at `coord`, sized by `severity` the same way a real reveal is. The
   * caller is expected to call `clearPreview()` then re-call this for
   * every tile in a fresh `HazardResult` on each update (a defense placed/
   * removed while previewing) — simpler and safer than diffing the old
   * preview set against the new one tile-by-tile.
   */
  showPreview(coord: AxialCoord, terrainTopY: number, severity: number): void {
    const key = `${coord.q},${coord.r}`;
    let index = this.previewByKey.get(key)?.index;
    if (index === undefined) {
      if (this.freeIndices.length > 0) index = this.freeIndices.pop()!;
      else if (this.nextIndex < MAX_INSTANCES) index = this.nextIndex++;
      else return; // out of shared capacity — same bail as show()
    }
    this.mesh.count = Math.max(this.mesh.count, index + 1);

    const { x, z } = axialToWorld(coord, 1.0);
    const intensity = THREE.MathUtils.clamp(severity / 1.6, 0, 1);
    const baseY = terrainTopY + 0.06 + intensity * 0.44;
    this.mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, baseY, z));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.setColorAt(index, PREVIEW_OVERLAY_COLOR);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    this.previewByKey.set(key, { index, x, z, baseY });
  }

  /** Clears every preview tile instantly — must leave zero ghost tiles behind, since a leftover one reads as "something is still dangerous here" when it isn't. */
  clearPreview(): void {
    if (this.previewByKey.size === 0) return;
    for (const { index } of this.previewByKey.values()) {
      this.mesh.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0));
      this.freeIndices.push(index);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.previewByKey.clear();
  }

  tick(nowMs: number): void {
    this.animator.tick(nowMs);
    if (this.previewByKey.size > 0) {
      for (const { index, x, z, baseY } of this.previewByKey.values()) {
        const y = baseY + Math.sin(nowMs / PREVIEW_PULSE_PERIOD_MS) * PREVIEW_PULSE_HEIGHT;
        this.mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, y, z));
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
