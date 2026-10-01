import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { coneFrustum, plan } from "./primitives3d";

/**
 * Landmarks used one bespoke low-poly building shape per category
 * (church/temple/mosque/market/palace/institution/park/viewpoint/beach) —
 * see git history for that version. User playtest feedback: too busy
 * against the buildable elements, and keeping sixteen landmarks legible
 * at a glance mattered less than keeping them simple. Replaced every
 * category builder with one uniform marker: a two-tone golden star on a
 * short post, same construction language as everything else in this file
 * (`primitives3d.ts` helpers only, flat-shaded, vertex-colored, no
 * texture — `GAUNTLET_PROMPT.md` Section 9). The two-tone star (a darker
 * base layer under a brighter, slightly smaller top layer) keeps a little
 * dimensionality and grayscale distinguishability without adding a second
 * shape family.
 */

/** A 10-point star outline (5 outer points at `outerR`, 5 inner points at `innerR`), tip pointing +Z, for `plan()`'s (x, z) footprint. */
function starPoints(outerR: number, innerR: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = Math.PI / 2 + i * (Math.PI / 5);
    pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return pts;
}

/** Every landmark's marker: a short post topped by a two-tone golden star. */
export function goldenStarGeometry(): THREE.BufferGeometry {
  const post = coneFrustum(0.01, 0.016, 0.22, 6, "#7c6a4f", 0);
  const starBase = plan(starPoints(0.135, 0.055), 0.018, "#c9960f", 0.21);
  const starTop = plan(starPoints(0.115, 0.047), 0.02, "#ffd84d", 0.228);
  return mergeGeometries([post, starBase, starTop]);
}

export function createLandmarkGeometry(_icon: string): THREE.BufferGeometry {
  return goldenStarGeometry();
}
