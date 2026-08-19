import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { TERRAIN_DEFS, TERRAIN_BY_ID, type TerrainDef } from "@core/terrain";
import { createHexPrismGeometry } from "./hexGeometry";
import { jitterColor, paletteColor } from "./palette";
import { SettleAnimator } from "./settleAnimation";

export const HEX_SIZE = 1.0;
const MAX_INSTANCES_PER_TYPE = 400;

const TIER_HEIGHT: Record<TerrainDef["elevationTier"], number> = {
  coastal: 0.45,
  midland: 0.85,
  highland: 1.35
};

interface TerrainInstance {
  coord: AxialCoord;
  index: number;
  terrainId: string;
  baseColor: THREE.Color;
}

export class TerrainMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();
  private placed = new Map<string, TerrainInstance>();
  private animator = new SettleAnimator();

  constructor() {
    for (const terrain of TERRAIN_DEFS) {
      const height = TIER_HEIGHT[terrain.elevationTier];
      const geometry = createHexPrismGeometry(HEX_SIZE * 0.98, height);
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
    const terrain = TERRAIN_BY_ID.get(terrainId);
    return terrain ? TIER_HEIGHT[terrain.elevationTier] : TIER_HEIGHT.midland;
  }

  hasTile(coord: AxialCoord): boolean {
    return this.placed.has(`${coord.q},${coord.r}`);
  }

  /** Places a tile. When `animate` is true it drops/settles into place over ~SETTLE_DURATION_MS. */
  placeTile(coord: AxialCoord, terrainId: string, options: { animate?: boolean } = {}): void {
    const terrain = TERRAIN_BY_ID.get(terrainId);
    if (!terrain) throw new Error(`Unknown terrain id: ${terrainId}`);
    const mesh = this.meshes.get(terrainId)!;
    const index = this.counts.get(terrainId)!;
    if (index >= MAX_INSTANCES_PER_TYPE) throw new Error(`Terrain instance cap exceeded for ${terrainId}`);

    const { x, z } = axialToWorld(coord, HEX_SIZE);

    if (options.animate) {
      this.animator.begin(mesh, index, x, z, 0, performance.now());
    } else {
      const matrix = new THREE.Matrix4().makeTranslation(x, 0, z);
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }

    const seed = coord.q * 31 + coord.r * 17;
    const color = jitterColor(paletteColor(terrain.colorKey), seed);
    mesh.setColorAt(index, color);

    this.counts.set(terrainId, index + 1);
    mesh.count = index + 1;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.placed.set(`${coord.q},${coord.r}`, { coord, index, terrainId, baseColor: color.clone() });
  }

  /**
   * Overrides a tile's color (e.g. the flood telegraph darkening river
   * tiles). Pass `null` to restore its normal palette color.
   */
  setTint(coord: AxialCoord, tint: THREE.Color | null, blend = 0.6): void {
    const inst = this.placed.get(`${coord.q},${coord.r}`);
    if (!inst) return;
    const mesh = this.meshes.get(inst.terrainId)!;
    const color = tint ? inst.baseColor.clone().lerp(tint, blend) : inst.baseColor;
    mesh.setColorAt(inst.index, color);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Advances any in-flight settle animations. Call once per rendered frame. */
  tick(nowMs: number): void {
    this.animator.tick(nowMs);
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

  /** World-space Y a building/prop should sit at on this tile (its top surface). */
  heightAt(coord: AxialCoord): number {
    const terrainId = this.terrainIdAt(coord);
    return terrainId ? this.height(terrainId) : 0;
  }
}
