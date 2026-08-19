import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { createHexPrismGeometry } from "./hexGeometry";
import { SettleAnimator } from "./settleAnimation";

const MAX_INSTANCES = 400;
const OVERLAY_HEIGHT = 0.14;
const OVERLAY_LIFETIME_MS = 2200;

export interface HazardOverlayColors {
  shallow: string;
  deep: string;
}

/** Flood: pale shin-deep splash to a dark, saturated inundation. */
export const FLOOD_OVERLAY_COLORS: HazardOverlayColors = { shallow: "#8fbfd6", deep: "#0d3752" };
/** Cyclone: wind-swept dust/debris tan to a bruised storm gray — visibly not water. */
export const CYCLONE_OVERLAY_COLORS: HazardOverlayColors = { shallow: "#d8c9a3", deep: "#4a4550" };

/**
 * Visible hazard resolution (Section 2/9's non-negotiable: the event must be
 * seen on the map, not just reflected in meter numbers). A translucent disc
 * appears on each damaged tile — both its height *and* its color saturation
 * scale with how much damage it took, so light damage reads differently
 * from severe damage at a glance — then it recedes and fades. One instance
 * per hazard type (different color language) sharing the same mechanics.
 */
export class HazardOverlayManager {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private animator = new SettleAnimator();
  private shallow: THREE.Color;
  private deep: THREE.Color;

  constructor(colors: HazardOverlayColors, name: string) {
    this.shallow = new THREE.Color(colors.shallow);
    this.deep = new THREE.Color(colors.deep);

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
    this.mesh.name = name;
  }

  /** Shows an overlay on `coord`, sized and colored by `severity`, that recedes after ~2s. */
  show(coord: AxialCoord, terrainTopY: number, severity: number, nowMs: number): void {
    if (this.count >= MAX_INSTANCES) return;
    const index = this.count++;
    this.mesh.count = this.count;

    const { x, z } = axialToWorld(coord, 1.0);
    const intensity = THREE.MathUtils.clamp(severity / 1.6, 0, 1);
    const peakY = terrainTopY + 0.06 + intensity * 0.44;
    this.animator.begin(this.mesh, index, x, z, peakY, nowMs);

    const color = this.shallow.clone().lerp(this.deep, intensity);
    this.mesh.setColorAt(index, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    setTimeout(() => {
      this.animator.collapse(this.mesh, index, x, peakY, z, performance.now());
    }, OVERLAY_LIFETIME_MS);
  }

  /** Clears all overlays instantly (e.g. starting a fresh hazard event). */
  reset(): void {
    this.count = 0;
    this.mesh.count = 0;
  }

  tick(nowMs: number): void {
    this.animator.tick(nowMs);
  }
}
