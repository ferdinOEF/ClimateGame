import * as THREE from "three";
import { axialKey, axialToWorld, neighbor, type AxialCoord } from "@core/hex";

/**
 * The phase's area to protect, kept on the map after the cone has gone
 * (Section 12): a faint dashed line round the tiles where a home would still
 * be lost. Thin and low contrast, just above the tiles (the labels are DOM,
 * always above it). Recomputed by the caller after every build from the same
 * model as the heat; when the tiles run out it fades away rather than
 * vanishing.
 */
const DASHES_PER_EDGE = 3;
/** Share of each dash slot that is drawn. */
const DASH_FILL = 0.55;
const WIDTH = 0.07;
const LIFT = 0.58;
const OPACITY = 0.6;
const FADE_MS = 600;

export class AreaOutline {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshBasicMaterial({ color: "#fff4d6", transparent: true, opacity: OPACITY, depthWrite: false, side: THREE.DoubleSide });
  private target = 0;
  private lastMs = 0;
  /** Tiles outlined now (0 once it has faded or was never shown). */
  tileCount = 0;
  /** The middle of the last tiles outlined, world x/z: where "Area protected" is said. */
  centre: { x: number; z: number } | null = null;
  reducedMotion = false;

  /** Outlines `tiles` (an empty list fades the outline away). */
  show(tiles: AxialCoord[], heightAt: (coord: AxialCoord) => number): void {
    if (tiles.length === 0) {
      this.target = 0;
      this.tileCount = 0;
      if (this.reducedMotion) this.clear();
      return;
    }
    this.clear();
    this.tileCount = tiles.length;
    const inside = new Set(tiles.map((tile) => axialKey(tile)));
    const positions: number[] = [];
    let sx = 0;
    let sz = 0;
    for (const tile of tiles) {
      const centre = axialToWorld(tile, 1);
      sx += centre.x;
      sz += centre.z;
      const y = heightAt(tile) + LIFT;
      const corners = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return { x: centre.x + Math.cos(angle), z: centre.z + Math.sin(angle) };
      });
      for (let dir = 0; dir < 6; dir++) {
        const next = neighbor(tile, dir);
        if (inside.has(axialKey(next))) continue;
        const other = axialToWorld(next, 1);
        const mid = { x: (centre.x + other.x) / 2, z: (centre.z + other.z) / 2 };
        const [a, b] = [...corners].sort((p, q) => (p.x - mid.x) ** 2 + (p.z - mid.z) ** 2 - ((q.x - mid.x) ** 2 + (q.z - mid.z) ** 2));
        for (let i = 0; i < DASHES_PER_EDGE; i++) {
          const t0 = (i + (1 - DASH_FILL) / 2) / DASHES_PER_EDGE;
          const t1 = t0 + DASH_FILL / DASHES_PER_EDGE;
          dash(positions, lerp(a, b, t0), lerp(a, b, t1), centre, y);
        }
      }
    }
    this.centre = { x: sx / tiles.length, z: sz / tiles.length };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
    this.target = OPACITY;
    if (this.reducedMotion) this.material.opacity = OPACITY;
  }

  /** Eases the opacity toward its target (the fade in and out). */
  tick(nowMs: number): void {
    const dt = this.lastMs ? Math.min(100, nowMs - this.lastMs) : 16;
    this.lastMs = nowMs;
    if (!this.mesh) return;
    const step = (dt / FADE_MS) * OPACITY;
    const o = this.material.opacity;
    this.material.opacity = o < this.target ? Math.min(this.target, o + step) : Math.max(this.target, o - step);
    if (this.target === 0 && this.material.opacity === 0) this.clear();
  }

  /** At once, no fade (a storm begins, the cone is back). */
  clear(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.material.opacity = 0;
    this.target = 0;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }
}

function lerp(a: { x: number; z: number }, b: { x: number; z: number }, t: number): { x: number; z: number } {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** A thin quad from `a` to `b`, offset inward (toward `centre`) so neighbouring edges never overlap. */
function dash(out: number[], a: { x: number; z: number }, b: { x: number; z: number }, centre: { x: number; z: number }, y: number): void {
  const inward = (p: { x: number; z: number }) => {
    const dx = centre.x - p.x;
    const dz = centre.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: p.x + (dx / l) * WIDTH, z: p.z + (dz / l) * WIDTH };
  };
  const a2 = inward(a);
  const b2 = inward(b);
  out.push(a.x, y, a.z, b.x, y, b.z, b2.x, y, b2.z, a.x, y, a.z, b2.x, y, b2.z, a2.x, y, a2.z);
}
