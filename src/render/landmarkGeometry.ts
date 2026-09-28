import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, taperedSlab, coneFrustum, dome, move } from "./primitives3d";

/**
 * STEP_PROMPT_panjim_landmark_map.md Section 2: small, simple, low-poly
 * flat-shaded marker shapes — the same construction language every
 * buildable element already uses (`elementGeometry.ts`, `primitives3d.ts`),
 * legible in grayscale, no unique textures. One shape per landmark
 * *category* (the doc's own explicit example list: church, temple, mosque,
 * market, school/college, viewpoint) — several landmarks that share a
 * category (every school/college/institute/museum/academy) share one
 * geometry too, since "distinctiveness at a glance matters more than
 * detail" is explicitly about telling categories apart, not telling every
 * individual college apart from every other college. These are standalone
 * meshes (own `LandmarkMeshManager`, not `ElementMeshManager`'s tinted
 * `InstancedMesh` pool) — no tint-multiply gotcha to re-check here, colors
 * below are the real final on-screen ones.
 */

/** A whitewashed hilltop church: a simple nave, a small bell-tower, a dome, and a cross on top. */
export function churchGeometry(): THREE.BufferGeometry {
  const nave = box(0.34, 0.26, 0.22, "#f2ede0", 0);
  const tower = box(0.14, 0.4, 0.14, "#f2ede0", 0);
  move(tower, 0, 0, -0.15);
  const dome1 = dome(0.1, 0.09, 0.1, "#e6b268", 0.4);
  move(dome1, 0, 0, -0.15);
  const crossV = box(0.02, 0.12, 0.02, "#8a3a1f", 0.58);
  move(crossV, 0, 0, -0.15);
  const crossH = box(0.08, 0.02, 0.02, "#8a3a1f", 0.63);
  move(crossH, 0, 0, -0.15);
  const facadeTrim = box(0.36, 0.03, 0.02, "#d8b158", 0.26);
  move(facadeTrim, 0, 0, 0.11);
  return mergeGeometries([nave, tower, dome1, crossV, crossH, facadeTrim]);
}

/** A Hindu temple: a stepped, tapering gopuram-style tower over a small base shrine. */
export function templeGeometry(): THREE.BufferGeometry {
  const base = box(0.3, 0.14, 0.26, "#e6b268", 0);
  const tier1 = taperedSlab(0.26, 0.2, 0.12, 0.22, "#d8963c", 0.14);
  const tier2 = taperedSlab(0.19, 0.13, 0.1, 0.16, "#c9832e", 0.26);
  const tier3 = taperedSlab(0.12, 0.06, 0.09, 0.1, "#b06f2a", 0.36);
  const finial = coneFrustum(0.005, 0.03, 0.08, 5, "#8a3a1f", 0.45);
  return mergeGeometries([base, tier1, tier2, tier3, finial]);
}

/** A mosque: a squat domed prayer hall flanked by one slender minaret. */
export function mosqueGeometry(): THREE.BufferGeometry {
  const hall = box(0.3, 0.2, 0.24, "#f2ede0", 0);
  const mainDome = dome(0.13, 0.12, 0.13, "#3c9c8e", 0.2);
  const minaret = coneFrustum(0.03, 0.045, 0.42, 6, "#f2ede0", 0);
  move(minaret, 0.19, 0, -0.1);
  const minaretCap = coneFrustum(0.001, 0.04, 0.08, 6, "#3c9c8e", 0.42);
  move(minaretCap, 0.19, 0, -0.1);
  const finial = coneFrustum(0.002, 0.012, 0.05, 4, "#d8b158", 0.5);
  move(finial, 0.19, 0, -0.1);
  return mergeGeometries([hall, mainDome, minaret, minaretCap, finial]);
}

/** A market stall row: a low platform under a striped awning on four posts. */
export function marketGeometry(): THREE.BufferGeometry {
  const platform = box(0.38, 0.04, 0.28, "#a9793f", 0);
  const posts: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [-0.16, -0.11],
    [0.16, -0.11],
    [-0.16, 0.11],
    [0.16, 0.11]
  ]) {
    const post = box(0.02, 0.16, 0.02, "#7c6a4f", 0.04);
    move(post, x, 0, z);
    posts.push(post);
  }
  const awningA = box(0.42, 0.02, 0.34, "#b5502e", 0.2);
  const awningB = box(0.42, 0.022, 0.1, "#e7e2cf", 0.2);
  move(awningB, 0, 0, -0.12);
  return mergeGeometries([platform, ...posts, awningA, awningB]);
}

/**
 * A riverfront Portuguese-era palace: a wide two-storey facade with a
 * shallow central dome and two small corner towers — grander than the
 * generic institution shape below, since this is one of the estuary
 * patch's most visually prominent landmarks (Idalcao Palace / Old
 * Secretariat).
 */
export function palaceGeometry(): THREE.BufferGeometry {
  const facade = box(0.44, 0.22, 0.24, "#f4d9a6", 0);
  const parapet = box(0.46, 0.03, 0.26, "#e6b268", 0.22);
  const centralDome = dome(0.07, 0.06, 0.07, "#8a3a1f", 0.25);
  const towerL = box(0.08, 0.3, 0.08, "#f4d9a6", 0);
  move(towerL, -0.19, 0, -0.08);
  const towerR = box(0.08, 0.3, 0.08, "#f4d9a6", 0);
  move(towerR, 0.19, 0, -0.08);
  const towerCapL = coneFrustum(0.001, 0.06, 0.06, 4, "#8a3a1f", 0.3);
  move(towerCapL, -0.19, 0, -0.08);
  const towerCapR = coneFrustum(0.001, 0.06, 0.06, 4, "#8a3a1f", 0.3);
  move(towerCapR, 0.19, 0, -0.08);
  return mergeGeometries([facade, parapet, centralDome, towerL, towerR, towerCapL, towerCapR]);
}

/**
 * The generic institutional building — schools, colleges, the technical
 * institute, the cultural academy, the museum, and the cultural institute
 * all share this one shape (per the doc's own "books/building shape for
 * schools and colleges" example, extended to every other education/
 * culture landmark for the same reason: one clearly-institutional
 * silhouette, distinguishable from church/temple/mosque/market/palace at
 * a glance, without inventing a one-off shape per building this pass
 * doesn't ask for).
 */
export function institutionGeometry(): THREE.BufferGeometry {
  const block = box(0.34, 0.24, 0.22, "#e7e2cf", 0);
  const roof = taperedSlab(0.38, 0.06, 0.06, 0.26, "#8a3a1f", 0.24);
  const doorway = box(0.08, 0.12, 0.02, "#5a4632", 0);
  move(doorway, 0, 0, 0.11);
  const bookA = box(0.09, 0.03, 0.06, "#b5502e", 0.26);
  move(bookA, -0.08, 0, 0);
  const bookB = box(0.09, 0.035, 0.06, "#3c9c8e", 0.26);
  move(bookB, 0.03, 0, 0);
  return mergeGeometries([block, roof, doorway, bookA, bookB]);
}

/** A small public garden: a patch of lawn, one clipped tree, and a low perimeter railing. */
export function parkGeometry(): THREE.BufferGeometry {
  const lawn = box(0.4, 0.015, 0.34, "#8fc25a", 0);
  const trunk = coneFrustum(0.015, 0.02, 0.1, 5, "#7c6a4f", 0.015);
  const canopy = dome(0.09, 0.08, 0.09, "#3f6b3a", 0.115);
  const railA = box(0.36, 0.02, 0.015, "#e7e2cf", 0.015);
  move(railA, 0, 0, -0.15);
  const railB = box(0.36, 0.02, 0.015, "#e7e2cf", 0.015);
  move(railB, 0, 0, 0.15);
  return mergeGeometries([lawn, trunk, canopy, railA, railB]);
}

/** A clifftop lookout: a low platform, a railing facing the sea, and a single bench. */
export function viewpointGeometry(): THREE.BufferGeometry {
  const platform = box(0.3, 0.03, 0.26, "#8f8676", 0);
  const rail = box(0.3, 0.09, 0.015, "#e7e2cf", 0.03);
  move(rail, 0, 0, -0.12);
  const railPostA = box(0.015, 0.09, 0.015, "#7c6a4f", 0.03);
  move(railPostA, -0.13, 0, -0.12);
  const railPostB = box(0.015, 0.09, 0.015, "#7c6a4f", 0.03);
  move(railPostB, 0.13, 0, -0.12);
  const benchSeat = box(0.16, 0.02, 0.06, "#a9793f", 0.05);
  move(benchSeat, 0, 0, 0.06);
  const benchLegA = box(0.14, 0.05, 0.015, "#5a4632", 0);
  move(benchLegA, 0, 0, 0.04);
  return mergeGeometries([platform, rail, railPostA, railPostB, benchSeat, benchLegA]);
}

/** Miramar Beach's own marker — a striped beach umbrella over a small mat, reading "beach" at a glance without duplicating any buildable element's own shape. */
export function beachMarkerGeometry(): THREE.BufferGeometry {
  const mat = box(0.22, 0.01, 0.16, "#f4d9a6", 0);
  const pole = coneFrustum(0.008, 0.012, 0.22, 5, "#7c6a4f", 0.01);
  const canopyA = coneFrustum(0.001, 0.15, 0.05, 8, "#b5502e", 0.22);
  const canopyB = coneFrustum(0.001, 0.11, 0.052, 8, "#f2ede0", 0.222);
  return mergeGeometries([mat, pole, canopyA, canopyB]);
}

const LANDMARK_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  landmark_church: churchGeometry,
  landmark_temple: templeGeometry,
  landmark_mosque: mosqueGeometry,
  landmark_market: marketGeometry,
  landmark_palace: palaceGeometry,
  landmark_institution: institutionGeometry,
  landmark_park: parkGeometry,
  landmark_viewpoint: viewpointGeometry,
  landmark_beach: beachMarkerGeometry
};

export function createLandmarkGeometry(icon: string): THREE.BufferGeometry {
  const builder = LANDMARK_BUILDERS[icon];
  if (!builder) throw new Error(`No geometry builder for landmark icon: ${icon}`);
  return builder();
}
