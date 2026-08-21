import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { TERRAIN_DEFS, TERRAIN_BY_ID } from "@core/terrain";
import { createHexPrismGeometry } from "./hexGeometry";
import { jitterColor, paletteColor } from "./palette";
import { SettleAnimator } from "./settleAnimation";

export const HEX_SIZE = 1.0;
const MAX_INSTANCES_PER_TYPE = 400;
const UNCLAIMED_SINK = 0.15; // unclaimed tiles sit slightly lower, like they're still in the fog
// Two playtest passes landed on opposite failure modes here. First, the
// original per-terrain HSL desaturate (scale saturation down, nudge
// lightness toward mid-gray) read fine tile-by-tile but not at a glance:
// two terrain types with very different base lightness (sun-bleached sand
// vs. deep forest) still read as clearly different colors even dimmed, so
// "is this claimed?" wasn't legible across a mixed-terrain map. The fix for
// that — blending *hard* toward one shared neutral fog tone — overshot:
// a second playtest found unclaimed tiles now converge on one flat,
// near-indistinguishable tan regardless of terrain, which reads as broken
// in its own way once a claimed cluster isn't right there for contrast, and
// unclaimed Beach/Estuary/River/Coast were no longer recognizably different
// hues from each other. This is the middle ground: desaturate first (so
// each terrain keeps a fraction of its own hue/lightness, staying
// distinguishable from its neighbors), *then* blend a smaller amount toward
// fog (so the whole unclaimed field still reads as hazy/muted next to a
// claimed tile's full saturation). Tune both knobs together if this still
// doesn't land — they're solving two different problems, not one.
const UNCLAIMED_SATURATION_SCALE = 0.55; // how much of the terrain's own saturation survives
const UNCLAIMED_FOG_BLEND = 0.32; // how far the desaturated color is then pulled toward `fog`

interface TerrainInstance {
  coord: AxialCoord;
  index: number;
  terrainId: string;
  fullColor: THREE.Color;
  dimColor: THREE.Color;
  claimed: boolean;
}

function dim(color: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const desaturated = color.clone().setHSL(hsl.h, hsl.s * UNCLAIMED_SATURATION_SCALE, hsl.l);
  return desaturated.lerp(paletteColor("fog"), UNCLAIMED_FOG_BLEND);
}

/**
 * v2.1: the terrain map is fixed (Section 4) — `loadMap` renders the whole
 * authored map at boot, unclaimed tiles dimmed and slightly sunken.
 * `claimTile` reveals one in place (rise + brighten), reusing the same
 * settle-animation feel the old player-drawn tiles had.
 */
export class TerrainMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();
  private placed = new Map<string, TerrainInstance>();
  private animator = new SettleAnimator();

  constructor() {
    for (const terrain of TERRAIN_DEFS) {
      const geometry = createHexPrismGeometry(HEX_SIZE * 0.98, terrain.height);
      // Per-instance tint comes from InstancedMesh.instanceColor, which the
      // renderer picks up automatically — vertexColors is for a per-vertex
      // `color` geometry attribute we don't have, and would otherwise force
      // the shader to multiply against a missing (black) attribute.
      const material = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.9,
        metalness: 0.0
      });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES_PER_TYPE);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES_PER_TYPE * 3), 3);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = `terrain-${terrain.id}`;
      this.meshes.set(terrain.id, mesh);
      this.counts.set(terrain.id, 0);
      this.group.add(mesh);
    }
  }

  height(terrainId: string): number {
    return TERRAIN_BY_ID.get(terrainId)?.height ?? 0.5;
  }

  hasTile(coord: AxialCoord): boolean {
    return this.placed.has(`${coord.q},${coord.r}`);
  }

  /** Renders the entire fixed map at once, every tile dimmed/sunken (unclaimed) except `claimedCoords`. */
  loadMap(mapTiles: { coord: AxialCoord; terrainId: string }[], claimedCoords: Iterable<AxialCoord>): void {
    const claimedKeys = new Set(Array.from(claimedCoords, (c) => `${c.q},${c.r}`));

    for (const { coord, terrainId } of mapTiles) {
      const terrain = TERRAIN_BY_ID.get(terrainId);
      if (!terrain) throw new Error(`Unknown terrain id: ${terrainId}`);
      const mesh = this.meshes.get(terrainId)!;
      const index = this.counts.get(terrainId)!;
      if (index >= MAX_INSTANCES_PER_TYPE) throw new Error(`Terrain instance cap exceeded for ${terrainId}`);

      const { x, z } = axialToWorld(coord, HEX_SIZE);
      const key = `${coord.q},${coord.r}`;
      const claimed = claimedKeys.has(key);
      const seed = coord.q * 31 + coord.r * 17;
      const fullColor = jitterColor(paletteColor(terrain.colorKey), seed);
      const dimColor = dim(fullColor);

      const y = claimed ? 0 : -UNCLAIMED_SINK;
      mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, y, z));
      mesh.setColorAt(index, claimed ? fullColor : dimColor);

      this.counts.set(terrainId, index + 1);
      mesh.count = index + 1;

      this.placed.set(key, { coord, index, terrainId, fullColor, dimColor, claimed });
    }

    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /** Reveals a tile: rises to its resting height and brightens to full color, over ~SETTLE_DURATION_MS. */
  claimTile(coord: AxialCoord): void {
    const inst = this.placed.get(`${coord.q},${coord.r}`);
    if (!inst || inst.claimed) return;
    inst.claimed = true;

    const mesh = this.meshes.get(inst.terrainId)!;
    const { x, z } = axialToWorld(coord, HEX_SIZE);
    this.animator.begin(mesh, inst.index, x, z, 0, performance.now());
    mesh.setColorAt(inst.index, inst.fullColor);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /**
   * Overrides a tile's color (e.g. the flood telegraph darkening river
   * tiles), blending from whatever its current resting color is (dimmed if
   * still unclaimed, full if claimed). Pass `null` to restore that resting color.
   */
  setTint(coord: AxialCoord, tint: THREE.Color | null, blend = 0.6): void {
    const inst = this.placed.get(`${coord.q},${coord.r}`);
    if (!inst) return;
    const mesh = this.meshes.get(inst.terrainId)!;
    const resting = inst.claimed ? inst.fullColor : inst.dimColor;
    const color = tint ? resting.clone().lerp(tint, blend) : resting;
    mesh.setColorAt(inst.index, color);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Advances any in-flight settle animations. Call once per rendered frame. */
  tick(nowMs: number): void {
    this.animator.tick(nowMs);
  }

  /** Re-dims every tile back to unclaimed (a new era resetting the player's footprint — the map itself stays). */
  resetClaims(claimedCoords: Iterable<AxialCoord> = []): void {
    const claimedKeys = new Set(Array.from(claimedCoords, (c) => `${c.q},${c.r}`));
    for (const inst of this.placed.values()) {
      const mesh = this.meshes.get(inst.terrainId)!;
      inst.claimed = claimedKeys.has(`${inst.coord.q},${inst.coord.r}`);
      const { x, z } = axialToWorld(inst.coord, HEX_SIZE);
      const y = inst.claimed ? 0 : -UNCLAIMED_SINK;
      mesh.setMatrixAt(inst.index, new THREE.Matrix4().makeTranslation(x, y, z));
      mesh.setColorAt(inst.index, inst.claimed ? inst.fullColor : inst.dimColor);
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /** Objects to include when raycasting for tile clicks. */
  get raycastTargets(): THREE.Object3D[] {
    return Array.from(this.meshes.values());
  }

  /** Maps a raycast hit (mesh + instanceId) back to the axial coord it represents. */
  coordForHit(object: THREE.Object3D, instanceId: number): AxialCoord | null {
    for (const inst of this.placed.values()) {
      if (this.meshes.get(inst.terrainId) === object && inst.index === instanceId) return inst.coord;
    }
    return null;
  }

  terrainIdAt(coord: AxialCoord): string | undefined {
    return this.placed.get(`${coord.q},${coord.r}`)?.terrainId;
  }

  isClaimedVisually(coord: AxialCoord): boolean {
    return this.placed.get(`${coord.q},${coord.r}`)?.claimed ?? false;
  }

  /** World-space Y a building/prop should sit at on this tile (its top surface). */
  heightAt(coord: AxialCoord): number {
    const terrainId = this.terrainIdAt(coord);
    return terrainId ? this.height(terrainId) : 0;
  }
}
