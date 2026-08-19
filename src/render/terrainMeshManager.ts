import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { TERRAIN_DEFS, TERRAIN_BY_ID, type TerrainDef } from "@core/terrain";
import { createHexPrismGeometry } from "./hexGeometry";
import { jitterColor, paletteColor } from "./palette";

export const HEX_SIZE = 1.0;
const MAX_INSTANCES_PER_TYPE = 400;
const SETTLE_DURATION_MS = 420;
const SETTLE_DROP_HEIGHT = 2.5;

const TIER_HEIGHT: Record<TerrainDef["elevationTier"], number> = {
  coastal: 0.45,
  midland: 0.85,
  highland: 1.35
};

interface TerrainInstance {
  coord: AxialCoord;
  index: number;
}

interface SettleAnim {
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  z: number;
  finalHeight: number;
  startTime: number;
}

/** t in [0,1] -> eased [0,1] with a slight overshoot, for a "click into place" feel. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

export class TerrainMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();
  private placed = new Map<string, TerrainInstance>();
  private activeAnims: SettleAnim[] = [];

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
      const matrix = new THREE.Matrix4()
        .makeScale(0.4, 0.4, 0.4)
        .setPosition(x, SETTLE_DROP_HEIGHT, z);
      mesh.setMatrixAt(index, matrix);
      this.activeAnims.push({ mesh, index, x, z, finalHeight: 0, startTime: performance.now() });
    } else {
      const matrix = new THREE.Matrix4().makeTranslation(x, 0, z);
      mesh.setMatrixAt(index, matrix);
    }

    const seed = coord.q * 31 + coord.r * 17;
    const color = jitterColor(paletteColor(terrain.colorKey), seed);
    mesh.setColorAt(index, color);

    this.counts.set(terrainId, index + 1);
    mesh.count = index + 1;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.placed.set(`${coord.q},${coord.r}`, { coord, index });
  }

  /** Advances any in-flight settle animations. Call once per rendered frame. */
  tick(nowMs: number): void {
    if (this.activeAnims.length === 0) return;
    const stillActive: SettleAnim[] = [];
    for (const anim of this.activeAnims) {
      const t = Math.min(1, (nowMs - anim.startTime) / SETTLE_DURATION_MS);
      const eased = easeOutBack(t);
      const y = anim.finalHeight + (SETTLE_DROP_HEIGHT - anim.finalHeight) * (1 - eased);
      const scale = THREE.MathUtils.clamp(0.4 + 0.6 * eased, 0, 1.08);
      const matrix = new THREE.Matrix4().makeScale(scale, scale, scale).setPosition(anim.x, y, anim.z);
      anim.mesh.setMatrixAt(anim.index, matrix);
      anim.mesh.instanceMatrix.needsUpdate = true;
      if (t < 1) stillActive.push(anim);
      else {
        const settled = new THREE.Matrix4().makeTranslation(anim.x, anim.finalHeight, anim.z);
        anim.mesh.setMatrixAt(anim.index, settled);
        anim.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.activeAnims = stillActive;
  }
}
