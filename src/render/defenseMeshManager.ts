import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { DEFENSE_DEFS, DEFENSE_BY_ID } from "@core/defenses";
import { HEX_SIZE } from "./terrainMeshManager";
import { createDefenseGeometry } from "./defenseGeometry";
import { jitterColor, paletteColor } from "./palette";
import { SettleAnimator } from "./settleAnimation";

const MAX_INSTANCES_PER_TYPE = 150;
const DEGRADED_TINT = new THREE.Color("#5b4a36"); // dull, patchy brown — a visibly weakened structure

interface DefenseInstanceRef {
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  y: number;
  z: number;
  baseColor: THREE.Color;
}

/**
 * Defense structures render the same way buildings do — one InstancedMesh
 * per category, small low-poly props sitting on their tile — but also need
 * to be destroyed (engineered catastrophic failure) or visually degraded
 * (khazan graceful decay) after a hazard resolves.
 */
export class DefenseMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();
  private byCoord = new Map<string, DefenseInstanceRef>();
  private animator = new SettleAnimator();

  constructor() {
    for (const defense of DEFENSE_DEFS) {
      const geometry = createDefenseGeometry(defense.id);
      const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES_PER_TYPE);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES_PER_TYPE * 3), 3);
      mesh.count = 0;
      mesh.name = `defense-${defense.id}`;
      this.meshes.set(defense.id, mesh);
      this.counts.set(defense.id, 0);
      this.group.add(mesh);
    }
  }

  place(coord: AxialCoord, defenseId: string, terrainTopY: number, options: { animate?: boolean } = {}): void {
    const def = DEFENSE_BY_ID.get(defenseId);
    if (!def) throw new Error(`Unknown defense id: ${defenseId}`);
    const mesh = this.meshes.get(defenseId)!;
    const index = this.counts.get(defenseId)!;
    if (index >= MAX_INSTANCES_PER_TYPE) throw new Error(`Defense instance cap exceeded for ${defenseId}`);

    const { x, z } = axialToWorld(coord, HEX_SIZE);

    if (options.animate) {
      this.animator.begin(mesh, index, x, z, terrainTopY, performance.now());
    } else {
      mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, terrainTopY, z));
      mesh.instanceMatrix.needsUpdate = true;
    }

    const seed = coord.q * 41 + coord.r * 19;
    const baseColor = jitterColor(paletteColor(def.colorKey), seed);
    mesh.setColorAt(index, baseColor);

    this.counts.set(defenseId, index + 1);
    mesh.count = index + 1;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.byCoord.set(`${coord.q},${coord.r}`, { mesh, index, x, y: terrainTopY, z, baseColor });
  }

  /** Catastrophic engineered failure: collapses and permanently hides the instance. */
  destroy(coord: AxialCoord): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref) return;
    this.animator.collapse(ref.mesh, ref.index, ref.x, ref.y, ref.z, performance.now());
    this.byCoord.delete(`${coord.q},${coord.r}`);
  }

  /** Khazan graceful degrade: tints the structure toward a patchy, weathered brown as degradeAmount grows. */
  setDegradeVisual(coord: AxialCoord, degradeAmount: number): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref) return;
    const t = THREE.MathUtils.clamp(degradeAmount / 0.5, 0, 1);
    const tinted = ref.baseColor.clone().lerp(DEGRADED_TINT, t * 0.7);
    ref.mesh.setColorAt(ref.index, tinted);
    if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true;
  }

  tick(nowMs: number): void {
    this.animator.tick(nowMs);
  }
}
