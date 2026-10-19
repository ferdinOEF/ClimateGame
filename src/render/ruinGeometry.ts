import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, move, rotate } from "./primitives3d";
import { buildingGeometry } from "./townGeometry";
import type { BuildingKind } from "@levels/townLayout";

/**
 * A home the storm destroyed (Section 21.3): what is left of its building
 * kind, sized from its own model. The roof gone, caved in across the floor;
 * the walls broken off low and jagged, one with a gap; rubble round the
 * foot. Darker and lower than the house, so a street of ruins reads at the
 * default zoom. One merged, flat-coloured geometry per kind, drawn instanced.
 */
const WALL = "#9a8a74";
const WALL_DARK = "#7c6d5a";
const ROOF = "#6e3b2a";
const RUBBLE = ["#7a6a58", "#5c4e40", "#8a6a50", "#6b5d4d"];
const FLOOR = "#5d5246";

const cache = new Map<BuildingKind, THREE.BufferGeometry>();

/** A small fixed pseudo-random sequence per kind, so every ruin of a kind is the same wreck (no flicker, no jitter). */
function sequence(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function ruinGeometry(kind: BuildingKind): THREE.BufferGeometry {
  const cached = cache.get(kind);
  if (cached) return cached;
  const model = buildingGeometry(kind);
  model.computeBoundingBox();
  const b = model.boundingBox!;
  const w = b.max.x - b.min.x;
  const d = b.max.z - b.min.z;
  const h = b.max.y;
  const cx = (b.max.x + b.min.x) / 2;
  const cz = (b.max.z + b.min.z) / 2;
  const t = Math.max(0.012, Math.min(w, d) * 0.08);
  const rand = sequence(kind.length * 977 + Math.round(h * 1000));
  const parts: THREE.BufferGeometry[] = [];
  parts.push(move(box(w * 1.02, 0.012, d * 1.02, FLOOR, 0), cx, 0, cz));
  // The four walls, broken off at 20 to 45% of the house's height, jagged in two or three steps; the front one split by a gap.
  const wallRun = (length: number, along: "x" | "z", at: number, gap: boolean): void => {
    const pieces = gap ? [[-0.5, -0.12], [0.12, 0.5]] : [[-0.5, 0.5]];
    for (const [from, to] of pieces) {
      const len = (to - from) * length;
      const mid = ((from + to) / 2) * length;
      let height = h * (0.2 + rand() * 0.25);
      let span = len;
      for (let step = 0; step < 3 && span > t; step++) {
        const offset = (rand() - 0.5) * (len - span);
        const g = along === "x" ? box(span, height, t, step === 0 ? WALL : WALL_DARK, 0) : box(t, height, span, step === 0 ? WALL : WALL_DARK, 0);
        parts.push(along === "x" ? move(g, cx + mid + offset, 0, at) : move(g, at, 0, cz + mid + offset));
        span *= 0.45 + rand() * 0.25;
        height *= 1.1 + rand() * 0.25;
        if (height > h * 0.55) height = h * 0.55;
      }
    }
  };
  wallRun(w, "x", cz + d / 2 - t / 2, true);
  wallRun(w, "x", cz - d / 2 + t / 2, false);
  wallRun(d, "z", cx - w / 2 + t / 2, false);
  wallRun(d, "z", cx + w / 2 - t / 2, rand() > 0.5);
  // The roof, caved in: two broken slabs lying tilted across the floor, one end up on a wall.
  for (const [dx, tilt, yaw] of [[-0.18, 0.32, 0.25], [0.2, -0.26, -0.4]] as [number, number, number][]) {
    const slab = box(w * 0.55, t * 0.8, d * 0.6, ROOF, 0);
    rotate(slab, tilt, yaw, tilt * 0.6);
    parts.push(move(slab, cx + dx * w, h * 0.1, cz + (rand() - 0.5) * d * 0.2));
  }
  // Rubble round the foot.
  for (let i = 0; i < 9; i++) {
    const s = Math.min(w, d) * (0.08 + rand() * 0.1);
    const chunk = box(s, s * (0.5 + rand() * 0.6), s * (0.7 + rand() * 0.6), RUBBLE[i % RUBBLE.length], 0);
    rotate(chunk, rand() * 0.6, rand() * Math.PI, rand() * 0.5);
    const a = rand() * Math.PI * 2;
    const r = 0.45 + rand() * 0.25;
    parts.push(move(chunk, cx + Math.cos(a) * w * r, 0, cz + Math.sin(a) * d * r));
  }
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) if (g.getAttribute("uv")) g.deleteAttribute("uv");
  const merged = mergeGeometries(flat)!;
  merged.computeVertexNormals();
  cache.set(kind, merged);
  return merged;
}

/** How dark a ruin is drawn against its house's own wall colour (instance tint). */
export const RUIN_TINT = new THREE.Color("#5f5243");
