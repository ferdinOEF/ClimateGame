import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";

/**
 * The tile under the pointer, when a build is possible there (Section 14): a
 * light hexagonal outline just above its top. One small mesh, moved about.
 */
export class TileHover {
  readonly mesh: THREE.Mesh;
  private key = "";

  constructor() {
    const outer = 0.97;
    const inner = 0.88;
    const pos: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a0 = (Math.PI / 180) * (60 * i - 30);
      const a1 = (Math.PI / 180) * (60 * (i + 1) - 30);
      const o0 = [Math.cos(a0) * outer, 0, Math.sin(a0) * outer];
      const o1 = [Math.cos(a1) * outer, 0, Math.sin(a1) * outer];
      const i0 = [Math.cos(a0) * inner, 0, Math.sin(a0) * inner];
      const i1 = [Math.cos(a1) * inner, 0, Math.sin(a1) * inner];
      pos.push(...o0, ...i1, ...o1, ...o0, ...i0, ...i1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const material = new THREE.MeshBasicMaterial({ color: "#fff6dc", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  /** Outlines `coord` (its top at `topY`), or hides the outline with null. */
  show(coord: AxialCoord | null, topY = 0): void {
    if (!coord) {
      this.mesh.visible = false;
      this.key = "";
      return;
    }
    const key = `${coord.q},${coord.r}`;
    if (key === this.key && this.mesh.visible) return;
    this.key = key;
    const { x, z } = axialToWorld(coord, 1.0);
    this.mesh.position.set(x, topY + 0.09, z);
    this.mesh.visible = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
