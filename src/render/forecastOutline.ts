import * as THREE from "three";
import { axialKey, axialToWorld, neighbor, type AxialCoord } from "@core/hex";

/**
 * The outline of a locked Forecast's zones: a bold, pulsing band along the
 * edge where threatened tiles meet safe ones.
 *
 * The translucent ghosts over each threatened tile say "this area" in colour.
 * This says it in shape, so it still reads in grayscale and over any terrain:
 * a light band against dark sea, dark band edges against light land. One
 * merged mesh, rebuilt only when the Forecast changes.
 */
const BAND_WIDTH = 0.3;
/** Above the translucent ghosts over each tile, so the edge is never dimmed by them. */
const LIFT = 0.62;

export class ForecastOutline {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshBasicMaterial({
    color: "#fff3c4",
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  private readonly coreMaterial = new THREE.MeshBasicMaterial({
    color: "#5a1d12",
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  private core: THREE.Mesh | null = null;

  /** Outlines `tiles`. `heightAt` gives each tile's top surface. */
  show(tiles: AxialCoord[], heightAt: (coord: AxialCoord) => number): void {
    this.clear();
    const inside = new Set(tiles.map((tile) => axialKey(tile)));
    const outer: number[] = [];
    const inner: number[] = [];
    for (const tile of tiles) {
      const centre = axialToWorld(tile, 1);
      const y = heightAt(tile) + LIFT;
      const corners = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return { x: centre.x + Math.cos(angle), z: centre.z + Math.sin(angle) };
      });
      for (let dir = 0; dir < 6; dir++) {
        const next = neighbor(tile, dir);
        if (inside.has(axialKey(next))) continue;
        // The shared edge is the two corners nearest the midpoint between the
        // two centres. Found by distance rather than by index, so it does not
        // depend on which way the direction table happens to run.
        const other = axialToWorld(next, 1);
        const mid = { x: (centre.x + other.x) / 2, z: (centre.z + other.z) / 2 };
        const [a, b] = [...corners].sort((p, q) => (p.x - mid.x) ** 2 + (p.z - mid.z) ** 2 - ((q.x - mid.x) ** 2 + (q.z - mid.z) ** 2));
        band(outer, a, b, centre, y, BAND_WIDTH, 0);
        band(inner, a, b, centre, y + 0.005, BAND_WIDTH * 0.4, BAND_WIDTH * 0.3);
      }
    }
    this.mesh = new THREE.Mesh(geometry(outer), this.material);
    this.core = new THREE.Mesh(geometry(inner), this.coreMaterial);
    this.mesh.renderOrder = 5;
    this.core.renderOrder = 6;
    this.group.add(this.mesh, this.core);
  }

  clear(): void {
    for (const mesh of [this.mesh, this.core]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.mesh = null;
    this.core = null;
  }

  tick(nowMs: number): void {
    if (!this.mesh) return;
    this.material.opacity = 0.65 + 0.3 * Math.sin(nowMs * 0.004);
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.coreMaterial.dispose();
  }
}

/** A quad along edge a–b, inset toward the tile centre by `offset` and `width` wide, as two triangles. */
function band(out: number[], a: { x: number; z: number }, b: { x: number; z: number }, centre: { x: number; z: number }, y: number, width: number, offset: number): void {
  const inset = (p: { x: number; z: number }, d: number) => {
    const dx = centre.x - p.x;
    const dz = centre.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: p.x + (dx / len) * d, z: p.z + (dz / len) * d };
  };
  const a0 = inset(a, offset);
  const b0 = inset(b, offset);
  const a1 = inset(a, offset + width);
  const b1 = inset(b, offset + width);
  out.push(a0.x, y, a0.z, b0.x, y, b0.z, b1.x, y, b1.z, a0.x, y, a0.z, b1.x, y, b1.z, a1.x, y, a1.z);
}

function geometry(positions: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}
