import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";

const MAX_RING_INSTANCES = 300;
const RING_COLOR = new THREE.Color("#fff3c4");

/**
 * v2.1: every hex already has real terrain (Section 4's fixed map), so
 * there's no more "ghost hex at an empty coord." What's shown instead is a
 * thin glowing ring sitting just above each currently-claimable tile's own
 * surface — visual only, not a raycast target (the click handler raycasts
 * the terrain tiles directly and asks GameState whether that coord is
 * claimable).
 */
export class ClaimRingMeshManager {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;

  constructor() {
    const geometry = new THREE.TorusGeometry(0.72, 0.045, 6, 6);
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: RING_COLOR,
      emissive: RING_COLOR,
      emissiveIntensity: 0.6,
      roughness: 0.4
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_RING_INSTANCES);
    this.mesh.count = 0;
    this.mesh.name = "claim-rings";
  }

  update(claimable: { coord: AxialCoord; topY: number }[]): void {
    let i = 0;
    for (const { coord, topY } of claimable) {
      if (i >= MAX_RING_INSTANCES) break;
      const { x, z } = axialToWorld(coord, 1.0);
      this.mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, topY + 0.05, z));
      i++;
    }
    this.count = i;
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  tick(nowMs: number): void {
    if (this.count === 0) return;
    const pulse = 0.45 + Math.sin(nowMs * 0.004) * 0.2;
    (this.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
  }
}
