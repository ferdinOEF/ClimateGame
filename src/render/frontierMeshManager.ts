import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialKey, axialToWorld } from "@core/hex";
import { createHexPrismGeometry } from "./hexGeometry";

const MAX_FRONTIER_INSTANCES = 300;
const GHOST_HEIGHT = 0.06;

const LEGAL_COLOR = new THREE.Color("#fff3c4");
const DIM_COLOR = new THREE.Color("#9fb0ad");

/**
 * Renders the open frontier as translucent ghost hexes (matching
 * Dorfromantik's own frontier presentation) — glowing/bright for cells the
 * currently-selected hand tile could legally go on, dim for the rest.
 */
export class FrontierMeshManager {
  readonly mesh: THREE.InstancedMesh;
  private order: string[] = [];

  constructor() {
    const geometry = createHexPrismGeometry(0.94, GHOST_HEIGHT);
    const material = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.55,
      roughness: 1,
      flatShading: true
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_FRONTIER_INSTANCES);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_FRONTIER_INSTANCES * 3),
      3
    );
    this.mesh.count = 0;
    this.mesh.name = "frontier-ghosts";
  }

  update(frontier: Iterable<AxialCoord>, legalCoords: Iterable<AxialCoord>): void {
    const legalKeys = new Set<string>();
    for (const c of legalCoords) legalKeys.add(axialKey(c));

    const coords = Array.from(frontier);
    this.order = coords.map(axialKey);

    let i = 0;
    for (const coord of coords) {
      if (i >= MAX_FRONTIER_INSTANCES) break;
      const { x, z } = axialToWorld(coord, 1.0);
      const matrix = new THREE.Matrix4().makeTranslation(x, 0, z);
      this.mesh.setMatrixAt(i, matrix);
      const color = legalKeys.has(axialKey(coord)) ? LEGAL_COLOR : DIM_COLOR;
      this.mesh.setColorAt(i, color);
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Maps a raycast instanceId back to the axial coord it represents. */
  coordForInstance(instanceId: number): AxialCoord | null {
    const key = this.order[instanceId];
    if (!key) return null;
    const [q, r] = key.split(",").map(Number);
    return { q, r };
  }
}
