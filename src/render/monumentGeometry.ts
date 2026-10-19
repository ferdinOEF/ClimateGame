import * as THREE from "three";
import { box, taperedSlab } from "./primitives3d";
import { landmarkGeometry } from "./landmarkModels";

/**
 * The sixteen real Panjim landmarks, as buildings and places on the board.
 *
 * Section 18 gave each its own model, drawn after the owner's approved
 * drawings (src/render/landmarkModels.ts); the shared massing per kind and the
 * stylised civic variants of earlier sections are gone. This module keeps the
 * small surface the renderer and the tests use: which geometry a monument
 * gets, what it is keyed by, and which kinds are buildings.
 *
 * SCALE
 *
 * Authored in the same units as the town's buildings. How big each is drawn
 * is set per monument by `monumentScale.ts`: filling most of its hex and
 * about twice the height of the tallest House beside it. Open places (the
 * garden, the beach, the headland) take a flat scale in the mesh manager.
 */

/** The geometry for one monument: its own model where it has one, else a plain block for an unknown building. */
export function createMonumentGeometryFor(id: string, kind: string): THREE.BufferGeometry {
  return landmarkGeometry(id) ?? createMonumentGeometry(kind);
}

/** Which geometry a monument uses: its own per id, or one plain block per kind for a monument with no model. */
export function monumentGeometryKey(id: string, kind: string): string {
  return landmarkGeometry(id) ? `landmark:${id}` : kind;
}

/** Kinds that are buildings (sized against their neighbours, on a plaza), as opposed to open places. */
export const MONUMENT_BUILDING_KINDS: readonly string[] = ["church", "temple", "mosque", "market", "palace", "institution"];

/** Every monument kind the renderer knows. The map generator's `kind` values must be a subset. */
export const MONUMENT_KINDS: readonly string[] = [...MONUMENT_BUILDING_KINDS, "park", "beach", "viewpoint"];

/**
 * A plain whitewashed block under a terracotta roof, for a monument with no model of its own.
 *
 * Draws something rather than throwing: a map naming a landmark this renderer has not been taught is a data error
 * worth noticing (`tests/monuments.test.ts` fails on it), not one worth a blank screen.
 */
export function createMonumentGeometry(kind: string): THREE.BufferGeometry {
  if (!MONUMENT_KINDS.includes(kind)) console.warn(`[monuments] no geometry for kind "${kind}"; drawing a plain block instead`);
  const body = box(0.5, 0.3, 0.36, "#fffaec", 0);
  const roof = taperedSlab(0.56, 0.06, 0.14, 0.42, "#b5502e", 0.3);
  const parts = [body, roof].map((g) => (g.index ? g.toNonIndexed() : g));
  for (const part of parts) if (part.getAttribute("uv")) part.deleteAttribute("uv");
  const positions: number[] = [];
  const colors: number[] = [];
  for (const part of parts) {
    positions.push(...(part.getAttribute("position").array as Float32Array));
    colors.push(...(part.getAttribute("color").array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
