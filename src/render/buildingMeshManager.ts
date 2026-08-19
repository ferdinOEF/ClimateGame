import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { BUILDING_DEFS, BUILDING_BY_ID } from "@core/buildings";
import { HEX_SIZE } from "./terrainMeshManager";
import { createBuildingGeometry } from "./buildingGeometry";
import { jitterColor, paletteColor } from "./palette";
import { SettleAnimator } from "./settleAnimation";

const MAX_INSTANCES_PER_TYPE = 200;

/**
 * Buildings render as small distinct low-poly props on their tile — one
 * InstancedMesh per building category, matching Section 8's rendering rule.
 */
export class BuildingMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();
  private animator = new SettleAnimator();

  constructor() {
    for (const building of BUILDING_DEFS) {
      const geometry = createBuildingGeometry(building.id);
      const material = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.85,
        metalness: 0.0
      });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES_PER_TYPE);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES_PER_TYPE * 3), 3);
      mesh.count = 0;
      mesh.name = `building-${building.id}`;
      this.meshes.set(building.id, mesh);
      this.counts.set(building.id, 0);
      this.group.add(mesh);
    }
  }

  place(coord: AxialCoord, buildingId: string, terrainTopY: number, options: { animate?: boolean } = {}): void {
    const def = BUILDING_BY_ID.get(buildingId);
    if (!def) throw new Error(`Unknown building id: ${buildingId}`);
    const mesh = this.meshes.get(buildingId)!;
    const index = this.counts.get(buildingId)!;
    if (index >= MAX_INSTANCES_PER_TYPE) throw new Error(`Building instance cap exceeded for ${buildingId}`);

    const { x, z } = axialToWorld(coord, HEX_SIZE);

    if (options.animate) {
      this.animator.begin(mesh, index, x, z, terrainTopY, performance.now());
    } else {
      const matrix = new THREE.Matrix4().makeTranslation(x, terrainTopY, z);
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }

    const seed = coord.q * 13 + coord.r * 29;
    mesh.setColorAt(index, jitterColor(paletteColor(def.colorKey), seed));

    this.counts.set(buildingId, index + 1);
    mesh.count = index + 1;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  tick(nowMs: number): void {
    this.animator.tick(nowMs);
  }

  /** Clears every placed building (a new era starting a fresh map). */
  reset(): void {
    for (const buildingId of this.counts.keys()) {
      this.counts.set(buildingId, 0);
      this.meshes.get(buildingId)!.count = 0;
    }
  }
}
