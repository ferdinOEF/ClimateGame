import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";

/**
 * The tile under the pointer, when a build is possible there (Section 14): a
 * light hexagonal outline just above its top. One small mesh, moved about.
 */
export class TileHover {
  readonly mesh: THREE.Mesh;
  private key = "";

  /** Section 34: a white halo under the keyboard cursor's dark ring, so it reads on dark sea and pale sand alike. */
  private readonly halo: THREE.Mesh;

  constructor() {
    const material = new THREE.MeshBasicMaterial({ color: "#fff6dc", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(ring(0.97, 0.88), material);
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.halo = new THREE.Mesh(ring(1.02, 0.8), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    this.halo.renderOrder = 4.9;
    this.halo.position.y = -0.005;
    this.halo.visible = false;
    this.mesh.add(this.halo);
  }

  /**
   * Section 34: the keyboard's tile cursor. The pointer's cream outline looked like the objective's pulsing tiles it
   * starts on, so the cursor is a darker, wider ring; the pointer's outline goes back to cream.
   */
  setKeyboard(on: boolean): void {
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.color.set(on ? "#1d2b3a" : "#fff6dc");
    material.opacity = on ? 0.95 : 0.85;
    this.mesh.scale.setScalar(on ? 1.04 : 1);
    this.halo.visible = on;
    // Section 37.6: the keyboard's ring is drawn over the objective's pulse (renderOrder 9 and 10, no depth test), which
    // hid it on the very tiles O goes to.
    material.depthTest = !on;
    (this.halo.material as THREE.MeshBasicMaterial).depthTest = !on;
    this.mesh.renderOrder = on ? 12 : 5;
    this.halo.renderOrder = on ? 11.9 : 4.9;
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
    this.halo.geometry.dispose();
    (this.halo.material as THREE.Material).dispose();
  }
}

/** A flat hexagonal ring between two radii, in the tile's plane. */
function ring(outer: number, inner: number): THREE.BufferGeometry {
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
  return geometry;
}
