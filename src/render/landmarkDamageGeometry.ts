import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, move, rotate } from "./primitives3d";

/**
 * A landmark after a storm (Section 21.3), made from its own model so it stays
 * recognisable: damaged (1), soot and crack streaks down its walls and a
 * section of its roof caved in; destroyed (2), more of both, the roof broken
 * open over a wide part. Rubble at its foot comes from `landmarkRubble`.
 */
function hash(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function damagedLandmarkGeometry(base: THREE.BufferGeometry, level: 1 | 2, seed: number): THREE.BufferGeometry {
  const g = (base.index ? base.toNonIndexed() : base.clone()) as THREE.BufferGeometry;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const col = g.getAttribute("color") as THREE.BufferAttribute | undefined;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const h = b.max.y;
  // Where the roof gives way: a point near the top, off centre, fixed per landmark.
  const px = b.min.x + (b.max.x - b.min.x) * (0.3 + 0.4 * hash(1, seed));
  const pz = b.min.z + (b.max.z - b.min.z) * (0.3 + 0.4 * hash(2, seed));
  const radius = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * (level === 2 ? 0.34 : 0.18);
  const above = h * (level === 2 ? 0.45 : 0.6);
  const streaks = level === 2 ? 0.26 : 0.13;
  const c = new THREE.Vector3();
  for (let t = 0; t < pos.count / 3; t++) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(new THREE.Vector3(pos.getX(t * 3 + k), pos.getY(t * 3 + k), pos.getZ(t * 3 + k)));
    c.multiplyScalar(1 / 3);
    let shade = 1;
    // The roof section caves in: dropped towards the floor below it, charred.
    if (c.y > above && Math.hypot(c.x - px, c.z - pz) < radius) {
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        const y = pos.getY(i);
        pos.setY(i, above * 0.55 + (y - above) * 0.25);
      }
      shade = 0.35;
    } else if (c.y > 0.02 && hash(t, seed) < streaks) shade = 0.5; // soot and cracks
    if (col && shade < 1) for (let k = 0; k < 3; k++) col.setXYZ(t * 3 + k, col.getX(t * 3 + k) * shade, col.getY(t * 3 + k) * shade, col.getZ(t * 3 + k) * shade);
  }
  pos.needsUpdate = true;
  if (col) col.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Rubble round a landmark's foot, in its model's units (about a hex across): more of it, and wider, when destroyed. */
export function landmarkRubble(level: 1 | 2, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const colours = ["#8a7d6b", "#6e6355", "#a39580", "#5e5347", "#8a5a40"];
  const count = level === 2 ? 22 : 11;
  for (let i = 0; i < count; i++) {
    const s = 0.03 + hash(i * 3 + 1, seed) * (level === 2 ? 0.06 : 0.04);
    const chunk = box(s, s * (0.5 + hash(i * 3 + 2, seed) * 0.6), s * (0.7 + hash(i, seed) * 0.6), colours[i % colours.length], 0);
    rotate(chunk, hash(i + 7, seed) * 0.7, hash(i + 11, seed) * Math.PI, hash(i + 13, seed) * 0.5);
    const a = hash(i + 17, seed) * Math.PI * 2;
    const r = 0.22 + hash(i + 19, seed) * (level === 2 ? 0.34 : 0.22);
    parts.push(move(chunk, Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of flat) if (p.getAttribute("uv")) p.deleteAttribute("uv");
  const merged = mergeGeometries(flat)!;
  merged.computeVertexNormals();
  return merged;
}
