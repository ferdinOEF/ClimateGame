import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, coneFrustum, dome, move, taperedSlab } from "./primitives3d";
import type { BuildingKind } from "@levels/townLayout";

/**
 * Panjim's buildings: seven small, low-poly kinds, flat-shaded like the rest
 * of the board, each about half the old House's footprint and height so the
 * grass, the street map and the warning heat show round them.
 *
 * Every vertex carries `aTint`, which says how the per-instance colours apply:
 *   0  keeps its own colour (doors, windows, awnings, signboards, plinths);
 *   1  is wall: multiplied by the instance's wall colour (`instanceColor`);
 *   2  is roof: multiplied by the instance's roof colour (`aRoofColor`).
 * Walls and roofs are built white (roof ridges a little darker) so the
 * multiply gives exactly the chosen colour. One InstancedMesh per kind, so
 * the whole town is seven draw calls.
 */
const WALL = "#ffffff";
const ROOF = "#ffffff";
const RIDGE = "#c8c8c8";
const PLINTH = "#8f5a3c";
const DOOR = "#5b3a24";
const PANE = "#31474a";
const FRAME = "#f2ecdc";

function tinted(g: THREE.BufferGeometry, tint: 0 | 1 | 2): THREE.BufferGeometry {
  const count = g.attributes.position.count;
  g.setAttribute("aTint", new THREE.BufferAttribute(new Float32Array(count).fill(tint), 1));
  return g;
}

const wall = (w: number, h: number, d: number, y = 0): THREE.BufferGeometry => tinted(box(w, h, d, WALL, y), 1);
const roof = (g: THREE.BufferGeometry): THREE.BufferGeometry => tinted(g, 2);
const fixed = (g: THREE.BufferGeometry): THREE.BufferGeometry => tinted(g, 0);

/** A window on the front (+z) face: a pale frame and a dark pane. */
function frontWindow(x: number, y: number, z: number, w = 0.06, h = 0.06): THREE.BufferGeometry[] {
  return [fixed(move(box(w + 0.018, h + 0.018, 0.012, FRAME, y - 0.009), x, 0, z)), fixed(move(box(w, h, 0.016, PANE, y), x, 0, z + 0.002))];
}

/** A pitched roof along z: a tapered slab with a darker ridge. */
function pitched(width: number, depth: number, rise: number, base: number): THREE.BufferGeometry[] {
  return [roof(taperedSlab(width, 0.03, rise, depth, ROOF, base)), roof(box(0.04, 0.025, depth + 0.01, RIDGE, base + rise - 0.015))];
}

/** Small house: the commonest. A plinth, one storey, a steep pitched roof. */
function smallHouse(): THREE.BufferGeometry {
  const parts = [fixed(box(0.36, 0.035, 0.3, PLINTH)), wall(0.32, 0.16, 0.26, 0.035)];
  parts.push(...pitched(0.42, 0.34, 0.15, 0.195));
  parts.push(fixed(move(box(0.07, 0.1, 0.012, DOOR, 0.035), 0, 0, 0.131)));
  parts.push(...frontWindow(-0.1, 0.1, 0.131), ...frontWindow(0.1, 0.1, 0.131));
  return mergeGeometries(parts);
}

/** Bungalow: low and wide, a deep hipped roof over a verandah on two posts. */
function bungalow(): THREE.BufferGeometry {
  const parts = [fixed(box(0.48, 0.035, 0.36, PLINTH)), wall(0.42, 0.14, 0.26, 0.035)];
  move(parts[1], 0, 0, -0.03);
  parts.push(roof(taperedSlab(0.54, 0.16, 0.13, 0.42, ROOF, 0.175)));
  parts.push(roof(box(0.18, 0.02, 0.3, RIDGE, 0.295)));
  for (const x of [-0.17, 0.17]) parts.push(fixed(move(coneFrustum(0.014, 0.018, 0.14, 5, FRAME, 0.035), x, 0, 0.15)));
  parts.push(fixed(move(box(0.07, 0.1, 0.012, DOOR, 0.035), 0, 0, 0.101)));
  parts.push(...frontWindow(-0.13, 0.09, 0.101), ...frontWindow(0.13, 0.09, 0.101));
  return mergeGeometries(parts);
}

/** Two-storey house: taller, two rows of windows, a balcony rail between them. */
function twoStorey(): THREE.BufferGeometry {
  const parts = [fixed(box(0.36, 0.035, 0.3, PLINTH)), wall(0.32, 0.32, 0.26, 0.035)];
  parts.push(...pitched(0.42, 0.34, 0.14, 0.355));
  parts.push(fixed(move(box(0.34, 0.018, 0.05, FRAME, 0.2), 0, 0, 0.145)));
  parts.push(fixed(move(box(0.07, 0.1, 0.012, DOOR, 0.035), 0, 0, 0.131)));
  for (const y of [0.1, 0.25]) parts.push(...frontWindow(-0.1, y, 0.131), ...frontWindow(0.1, y, 0.131));
  return mergeGeometries(parts);
}

/** Apartment block: three or four storeys, a flat roof with a water tank, a grid of windows. */
function apartment(): THREE.BufferGeometry {
  const parts = [fixed(box(0.42, 0.035, 0.36, PLINTH)), wall(0.38, 0.56, 0.32, 0.035)];
  parts.push(roof(box(0.4, 0.035, 0.34, ROOF, 0.595)));
  parts.push(fixed(move(coneFrustum(0.05, 0.05, 0.07, 8, "#3d4a55", 0.63), 0.1, 0, -0.06)));
  for (const y of [0.1, 0.23, 0.36, 0.49]) for (const x of [-0.12, 0, 0.12]) parts.push(...frontWindow(x, y, 0.161, 0.055, 0.06));
  return mergeGeometries(parts);
}

/** Cafe: one storey, a flat roof, a striped awning and a tiny table out front. */
function cafe(): THREE.BufferGeometry {
  const parts = [fixed(box(0.34, 0.035, 0.28, PLINTH)), wall(0.3, 0.16, 0.24, 0.035)];
  move(parts[1], 0, 0, -0.02);
  parts.push(roof(box(0.32, 0.03, 0.26, ROOF, 0.195)));
  move(parts[2], 0, 0, -0.02);
  // The awning: alternating stripes, sloping out over the door.
  for (let i = 0; i < 6; i++) {
    const stripe = fixed(box(0.05, 0.015, 0.12, i % 2 === 0 ? "#c8402e" : "#f4efe2", 0.165));
    stripe.rotateX(0.35);
    move(stripe, -0.125 + i * 0.05, 0.01, 0.15);
    parts.push(stripe);
  }
  parts.push(fixed(move(box(0.06, 0.1, 0.012, DOOR, 0.035), 0.06, 0, 0.101)));
  parts.push(...frontWindow(-0.07, 0.1, 0.101, 0.09, 0.06));
  // Table and two stools on the pavement.
  parts.push(fixed(move(coneFrustum(0.035, 0.035, 0.012, 8, "#f4efe2", 0.06), -0.06, 0, 0.21)));
  parts.push(fixed(move(coneFrustum(0.006, 0.006, 0.06, 4, "#4a3a2a", 0), -0.06, 0, 0.21)));
  for (const x of [-0.11, -0.01]) parts.push(fixed(move(box(0.025, 0.035, 0.025, "#4a3a2a", 0), x, 0, 0.21)));
  return mergeGeometries(parts);
}

/** Shop: a flat roof with a low parapet, a rolling shutter and a signboard stripe. */
function shop(): THREE.BufferGeometry {
  const parts = [fixed(box(0.4, 0.035, 0.3, PLINTH)), wall(0.36, 0.22, 0.26, 0.035)];
  parts.push(roof(box(0.38, 0.03, 0.28, ROOF, 0.255)));
  parts.push(wall(0.38, 0.04, 0.02, 0.285));
  move(parts[3], 0, 0, 0.13);
  parts.push(fixed(move(box(0.32, 0.045, 0.014, "#2f6f9e", 0.2), 0, 0, 0.133)));
  parts.push(fixed(move(box(0.03, 0.04, 0.016, "#f2c35b", 0.202), -0.11, 0, 0.135)));
  parts.push(fixed(move(box(0.2, 0.13, 0.012, "#8a8f91", 0.04), -0.03, 0, 0.131)));
  parts.push(...frontWindow(0.12, 0.1, 0.131, 0.05, 0.07));
  return mergeGeometries(parts);
}

/** Godown: a long, low warehouse by the water, a shallow pitched roof and a big door. */
function godown(): THREE.BufferGeometry {
  const parts = [fixed(box(0.52, 0.03, 0.36, PLINTH)), wall(0.48, 0.2, 0.32, 0.03)];
  parts.push(...pitched(0.56, 0.4, 0.09, 0.23));
  parts.push(fixed(move(box(0.18, 0.16, 0.012, "#6b4a2e", 0.03), 0, 0, 0.161)));
  parts.push(fixed(move(box(0.012, 0.16, 0.014, "#3f2c1c", 0.03), 0, 0, 0.163)));
  return mergeGeometries(parts);
}

const BUILDERS: Record<BuildingKind, () => THREE.BufferGeometry> = {
  small_house: smallHouse,
  bungalow,
  two_storey: twoStorey,
  apartment,
  cafe,
  shop,
  godown
};

const cache = new Map<BuildingKind, THREE.BufferGeometry>();

/**
 * Everything above is modelled at half the classic House; this brings the
 * small house to about 56% of its footprint and 57% of its height, the top
 * of the 45-60% range, so the town still reads at the opening zoom.
 */
const SIZE = 1.12;

export function buildingGeometry(kind: BuildingKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (!g) {
    g = BUILDERS[kind]();
    g.scale(SIZE, SIZE, SIZE);
    cache.set(kind, g);
  }
  return g;
}

/** Roof height of each kind, for a cat on the roof. */
export const ROOF_TOP: Record<BuildingKind, number> = {
  small_house: 0.34 * SIZE,
  bungalow: 0.3 * SIZE,
  two_storey: 0.49 * SIZE,
  apartment: 0.63 * SIZE,
  cafe: 0.225 * SIZE,
  shop: 0.325 * SIZE,
  godown: 0.32 * SIZE
};

/**
 * A garden: two or three small trees and a low hedge, on a tile the town
 * plan leaves empty. Not a game element: drawn by the town decoration layer.
 */
export function gardenGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tree = (x: number, z: number, h: number, r: number, tone: string): void => {
    parts.push(move(coneFrustum(0.018, 0.026, h, 5, "#6e5136", 0), x, 0, z));
    parts.push(move(dome(r, r * 0.9, r, tone, h - r * 0.4), x, 0, z));
  };
  tree(-0.2, -0.12, 0.2, 0.12, "#3f7a3a");
  tree(0.16, -0.18, 0.16, 0.1, "#4f8a3f");
  tree(0.06, 0.2, 0.18, 0.11, "#3a6e36");
  parts.push(move(box(0.3, 0.05, 0.05, "#4c7a3a", 0), -0.05, 0, 0.02));
  // A coconut palm: the Goan garden's signature.
  parts.push(move(coneFrustum(0.012, 0.02, 0.32, 5, "#7c6a4f", 0), 0.25, 0, 0.08));
  for (let i = 0; i < 5; i++) {
    const frond = box(0.16, 0.012, 0.035, "#4f8f3c", 0);
    frond.translate(0.08, 0, 0);
    frond.rotateZ(-0.35);
    frond.rotateY((i / 5) * Math.PI * 2);
    move(frond, 0.25, 0.32, 0.08);
    parts.push(frond);
  }
  return mergeGeometries(parts);
}
