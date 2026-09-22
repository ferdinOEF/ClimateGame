import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, coneFrustum, dome, blade, rotate, move } from "./primitives3d";

/**
 * Mirrors a geometry across X. A plain `geometry.scale(-1, 1, 1)` would be
 * simpler but silently breaks: negating one axis inverts every triangle's
 * winding order, and this codebase's flat-shaded materials render with
 * Three.js's default `FrontSide` culling (no element geometry anywhere
 * else needed a mirrored part before this file, so there was no existing
 * precedent to follow either way) — an un-rewound mirror would backface-
 * cull invisible. Swapping each de-indexed triangle's 2nd/3rd vertex
 * (position AND color, since `paint()` bakes per-vertex color) after the
 * flip restores correct winding.
 */
function mirrorX(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.clone();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = g.attributes.color as THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i++) pos.setX(i, -pos.getX(i));
  for (let tri = 0; tri < pos.count / 3; tri++) {
    const a = tri * 3 + 1;
    const b = tri * 3 + 2;
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    pos.setXYZ(a, bx, by, bz);
    pos.setXYZ(b, ax, ay, az);
    if (col) {
      const ar = col.getX(a), ag = col.getY(a), ab = col.getZ(a);
      const br = col.getX(b), bg = col.getY(b), bb = col.getZ(b);
      col.setXYZ(a, br, bg, bb);
      col.setXYZ(b, ar, ag, ab);
    }
  }
  pos.needsUpdate = true;
  if (col) col.needsUpdate = true;
  return g;
}

/**
 * STEP_PROMPT_creature_reactions.md Section 1: every creature/prop here is
 * low-poly, flat-shaded, and vertex-colored — never a texture, sprite, or
 * billboard — same multi-facet-plus-highlight construction language
 * `elementGeometry.ts` already uses for the Mangrove canopy etc. These are
 * standalone, transient reaction meshes spawned near a tile by
 * `ReactionAnimator`, NOT part of any element's own `InstancedMesh` — so,
 * confirmed by design rather than assumed, they never pass through
 * `ElementMeshManager`'s per-instance tint multiply (the
 * `STEP_PROMPT_icon_legibility_pass.md` addendum's gotcha). Colors below
 * are the real, final on-screen colors.
 */

// --- Birds -----------------------------------------------------------------

/** White-throated Kingfisher: turquoise-blue back, white throat, rufous belly, red-orange bill. */
export function kingfisherGeometry(): THREE.BufferGeometry {
  const body = dome(0.05, 0.045, 0.09, "#2f8fae", 0);
  move(body, 0, 0.05, 0);
  const belly = dome(0.035, 0.03, 0.05, "#f2ede0", 0);
  move(belly, 0, 0.045, 0.03);
  const head = dome(0.04, 0.04, 0.04, "#8a3a1f", 0);
  move(head, 0, 0.07, -0.07);
  const beak = coneFrustum(0.001, 0.012, 0.06, 4, "#c9832e", 0);
  rotate(beak, Math.PI / 2 + 0.15, 0, 0);
  move(beak, 0, 0.07, -0.12);
  const wingL = blade([[0, 0], [0.09, -0.02], [0.02, -0.09]], "#1f6e66", 0.01);
  rotate(wingL, 0, 0.2, 0.1);
  move(wingL, -0.03, 0.06, 0);
  const wingR = mirrorX(wingL);
  return mergeGeometries([body, belly, head, beak, wingL, wingR]);
}

/** Little Egret: all white, thin black legs/bill, S-curved neck. */
export function egretGeometry(): THREE.BufferGeometry {
  const body = dome(0.05, 0.045, 0.1, "#f2ede0", 0.06);
  const neck = coneFrustum(0.012, 0.018, 0.12, 5, "#f2ede0", 0.09);
  rotate(neck, -0.3, 0, 0);
  move(neck, 0, 0, -0.05);
  const head = dome(0.025, 0.022, 0.03, "#f2ede0", 0);
  move(head, 0, 0.19, -0.12);
  const bill = coneFrustum(0.001, 0.008, 0.05, 4, "#2a2a28", 0);
  rotate(bill, Math.PI / 2 + 0.1, 0, 0);
  move(bill, 0, 0.195, -0.15);
  const legL = coneFrustum(0.004, 0.006, 0.14, 4, "#2a2a28", -0.14);
  move(legL, -0.02, 0, 0.02);
  const legR = coneFrustum(0.004, 0.006, 0.14, 4, "#2a2a28", -0.14);
  move(legR, 0.02, 0, 0.02);
  return mergeGeometries([body, neck, head, bill, legL, legR]);
}

/** Brahminy Kite: chestnut body/wings, white head and breast, in a wide gliding-wing pose. */
export function brahminyKiteGeometry(): THREE.BufferGeometry {
  const body = dome(0.045, 0.04, 0.1, "#8a3a1f", 0.02);
  const head = dome(0.035, 0.033, 0.035, "#f2ede0", 0);
  move(head, 0, 0.05, -0.08);
  const beak = coneFrustum(0.001, 0.01, 0.03, 4, "#c9832e", 0);
  rotate(beak, Math.PI / 2, 0, 0);
  move(beak, 0, 0.05, -0.11);
  const wingL = blade([[0, 0], [0.24, 0.02], [0.2, -0.04], [0.05, -0.03]], "#8a3a1f", 0.012);
  rotate(wingL, 0.1, 0.05, 0.08);
  move(wingL, -0.02, 0.03, 0);
  const wingR = mirrorX(wingL);
  return mergeGeometries([body, head, beak, wingL, wingR]);
}

/** Plain, deliberately unornamented flying-silhouette bird — "some disturbed bird," not a named resident (Sand Mining's fleeing shorebirds). */
export function shorebirdGeometry(): THREE.BufferGeometry {
  const body = dome(0.035, 0.03, 0.07, "#8f8676", 0.01);
  const wingL = blade([[0, 0], [0.13, 0.03], [0.02, -0.02]], "#7d7568", 0.008);
  rotate(wingL, 0, 0.15, 0.15);
  const wingR = mirrorX(wingL);
  return mergeGeometries([body, wingL, wingR]);
}

/** Rock/Feral Pigeon: grey-blue body, small iridescent-green neck patch, orange feet — Seawall's cap-course perchers. */
export function pigeonGeometry(): THREE.BufferGeometry {
  const body = dome(0.04, 0.038, 0.07, "#8a8f91", 0.02);
  const neckPatch = dome(0.02, 0.018, 0.02, "#3c9c8e", 0);
  move(neckPatch, 0, 0.045, -0.04);
  const head = dome(0.025, 0.024, 0.025, "#8a8f91", 0);
  move(head, 0, 0.06, -0.06);
  const beak = coneFrustum(0.001, 0.006, 0.02, 4, "#2a2a28", 0);
  rotate(beak, Math.PI / 2, 0, 0);
  move(beak, 0, 0.06, -0.08);
  const legL = coneFrustum(0.003, 0.004, 0.03, 4, "#c9832e", -0.02);
  move(legL, -0.015, 0, 0.01);
  const legR = coneFrustum(0.003, 0.004, 0.03, 4, "#c9832e", -0.02);
  move(legR, 0.015, 0, 0.01);
  return mergeGeometries([body, neckPatch, head, beak, legL, legR]);
}

/** Great Cormorant: sleek black/dark-green body, long S-curved neck, hooked bill — Breakwater's reaction. */
export function cormorantGeometry(): THREE.BufferGeometry {
  const body = dome(0.045, 0.04, 0.1, "#1f2b28", 0.02);
  const highlight = dome(0.03, 0.026, 0.06, "#2f4a42", 0.03);
  move(highlight, 0, 0.01, 0.02);
  const neck = coneFrustum(0.01, 0.016, 0.14, 5, "#1f2b28", 0.06);
  rotate(neck, -0.25, 0, 0);
  move(neck, 0, 0, -0.05);
  const head = dome(0.022, 0.02, 0.028, "#1f2b28", 0);
  move(head, 0, 0.19, -0.12);
  const bill = coneFrustum(0.001, 0.008, 0.045, 4, "#2a2a28", 0);
  rotate(bill, Math.PI / 2 + 0.1, 0, 0);
  move(bill, 0, 0.19, -0.15);
  return mergeGeometries([body, highlight, neck, head, bill]);
}

// --- Insects & small water creatures ---------------------------------------

/** Dragonfly: thin segmented abdomen, four thin pale wings, large eyes. */
export function dragonflyGeometry(): THREE.BufferGeometry {
  const abdomen = coneFrustum(0.004, 0.008, 0.14, 5, "#1f6e66", 0);
  rotate(abdomen, Math.PI / 2, 0, 0);
  const thorax = dome(0.014, 0.012, 0.018, "#3c9c8e", 0);
  move(thorax, 0, 0, 0.06);
  const eyes = dome(0.012, 0.011, 0.014, "#2a2a28", 0);
  move(eyes, 0, 0.005, 0.08);
  const wing = (x: number, yaw: number) => {
    const g = blade([[0, 0], [0.11, 0.01], [0.02, -0.008]], "#dce8e4", 0.003);
    rotate(g, Math.PI / 2, yaw, 0);
    move(g, x, 0.015, 0.05);
    return g;
  };
  return mergeGeometries([abdomen, thorax, eyes, wing(0.01, 0.1), wing(-0.01, Math.PI - 0.1), wing(0.008, -0.15), wing(-0.008, Math.PI + 0.15)]);
}

/** A curved, translucent-pale prawn leaping from Khazan's water half. */
export function prawnGeometry(): THREE.BufferGeometry {
  const body = coneFrustum(0.006, 0.016, 0.12, 6, "#e0a89a", 0);
  rotate(body, Math.PI / 2, 0, 0.35);
  const tail = blade([[0, 0], [0.04, 0.015], [0.04, -0.015]], "#d89484", 0.01);
  rotate(tail, 0, 0, 0.35);
  move(tail, -0.1, 0.02, 0);
  const antenna = coneFrustum(0.0005, 0.002, 0.1, 3, "#e0a89a", 0);
  rotate(antenna, Math.PI / 2 - 0.3, 0, -0.2);
  move(antenna, 0.09, -0.01, 0);
  return mergeGeometries([body, tail, antenna]);
}

/** A stubby-finned, bulge-eyed mudskipper, mid-hop off Khazan's water. */
export function mudskipperGeometry(): THREE.BufferGeometry {
  const body = coneFrustum(0.012, 0.022, 0.1, 6, "#6b6a3a", 0);
  rotate(body, Math.PI / 2, 0, 0);
  const eyeL = dome(0.008, 0.008, 0.008, "#2a2a28", 0);
  move(eyeL, -0.012, 0.018, 0.04);
  const eyeR = dome(0.008, 0.008, 0.008, "#2a2a28", 0);
  move(eyeR, 0.012, 0.018, 0.04);
  const finL = blade([[0, 0], [0.03, -0.015], [0, -0.02]], "#8a9c4a", 0.005);
  rotate(finL, 0, 0.3, 0);
  move(finL, -0.02, -0.005, 0.01);
  const finR = mirrorX(finL);
  return mergeGeometries([body, eyeL, eyeR, finL, finR]);
}

// --- Beach & dry-land creatures ---------------------------------------------

/** A small brown-green garden lizard darting out from a Dune ridge. */
export function gardenLizardGeometry(): THREE.BufferGeometry {
  const body = coneFrustum(0.01, 0.02, 0.1, 5, "#6b7a4a", 0);
  rotate(body, Math.PI / 2, 0, 0);
  move(body, 0, 0.02, 0.03);
  const head = dome(0.016, 0.014, 0.02, "#6b7a4a", 0);
  move(head, 0, 0.018, 0.09);
  const tail = coneFrustum(0.001, 0.007, 0.14, 4, "#5a6a3a", 0);
  rotate(tail, Math.PI / 2, 0, 0.15);
  move(tail, 0, 0.018, -0.06);
  const legFront = (x: number) => {
    const g = coneFrustum(0.002, 0.004, 0.035, 3, "#5a6a3a", 0);
    move(g, x, 0, 0.05);
    return g;
  };
  const legBack = (x: number) => {
    const g = coneFrustum(0.002, 0.004, 0.035, 3, "#5a6a3a", 0);
    move(g, x, 0, -0.01);
    return g;
  };
  return mergeGeometries([body, head, tail, legFront(-0.02), legFront(0.02), legBack(-0.022), legBack(0.022)]);
}

/** A pale ghost crab bolting sideways from Sandy Vegetation's base. */
export function ghostCrabGeometry(): THREE.BufferGeometry {
  const carapace = dome(0.03, 0.018, 0.024, "#e7ddc8", 0);
  const eyeL = coneFrustum(0.003, 0.004, 0.018, 4, "#e7ddc8", 0.015);
  move(eyeL, -0.014, 0, 0.018);
  const eyeR = coneFrustum(0.003, 0.004, 0.018, 4, "#e7ddc8", 0.015);
  move(eyeR, 0.014, 0, 0.018);
  const clawL = blade([[0, 0], [0.02, 0.012], [0.024, -0.004]], "#d8c8a8", 0.006);
  rotate(clawL, 0, 0.4, 0);
  move(clawL, -0.03, 0.006, 0.01);
  const clawR = mirrorX(clawL);
  const legs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const z = -0.01 - i * 0.012;
    const legL = coneFrustum(0.001, 0.003, 0.035, 3, "#d8c8a8", 0.004);
    rotate(legL, 0, 0, 0.9);
    move(legL, -0.028, 0, z);
    const legR = mirrorX(legL);
    legs.push(legL, legR);
  }
  return mergeGeometries([carapace, eyeL, eyeR, clawL, clawR, ...legs]);
}

/** A silver-blue fish leaping clear of Small Dam's spillway. */
export function leapingFishGeometry(): THREE.BufferGeometry {
  const body = coneFrustum(0.006, 0.022, 0.13, 6, "#8fb4c4", 0);
  rotate(body, Math.PI / 2, 0, 0.1);
  const highlight = coneFrustum(0.004, 0.014, 0.09, 5, "#c9dde2", 0);
  rotate(highlight, Math.PI / 2, 0, 0.1);
  move(highlight, 0, 0.006, 0.01);
  const tailFin = blade([[0, 0], [-0.03, 0.02], [-0.03, -0.02]], "#5a90a4", 0.005);
  rotate(tailFin, 0, 0, 0.1);
  move(tailFin, -0.07, 0.005, -0.005);
  return mergeGeometries([body, highlight, tailFin]);
}

// --- House / Resort accents --------------------------------------------------

/** A small low-poly cat, stretching near House's veranda. */
export function catGeometry(): THREE.BufferGeometry {
  const body = dome(0.045, 0.035, 0.09, "#c9832e", 0);
  const head = dome(0.03, 0.028, 0.032, "#c9832e", 0);
  move(head, 0, 0.02, -0.08);
  const earL = blade([[0, 0], [0.012, 0.02], [-0.008, 0.018]], "#c9832e", 0.004);
  move(earL, -0.018, 0.045, -0.09);
  const earR = mirrorX(earL);
  const tail = coneFrustum(0.002, 0.009, 0.16, 5, "#c9832e", 0);
  rotate(tail, 0.3, 0, -0.4);
  move(tail, 0, 0.02, 0.06);
  return mergeGeometries([body, head, earL, earR, tail]);
}

/** A brightly two-toned beach ball, bouncing across Beachside Resort's pool deck. */
export function beachBallGeometry(): THREE.BufferGeometry {
  const base = dome(0.045, 0.045, 0.045, "#d84a3a", -0.045);
  const bandA = dome(0.046, 0.02, 0.046, "#f4d9a6", -0.01);
  const bandB = dome(0.046, 0.014, 0.046, "#3c9c8e", -0.045);
  return mergeGeometries([base, bandA, bandB]);
}

/** A small transient palm frond cluster — the reaction's own prop, not a restoration of Beachside Resort's static model (its palm was removed in a later balancing pass; this is a new small reaction-only prop, same category as every other creature here). */
export function palmFrondGeometry(): THREE.BufferGeometry {
  const trunk = coneFrustum(0.012, 0.018, 0.1, 5, "#7c6a4f", 0);
  const parts: THREE.BufferGeometry[] = [trunk];
  const frondCount = 5;
  for (let i = 0; i < frondCount; i++) {
    const yaw = (i / frondCount) * Math.PI * 2;
    const tone = i % 2 === 0 ? "#3f6b3a" : "#6fa24a";
    const g = blade([[-0.012, 0], [0.012, 0], [0.006, 0.16], [-0.006, 0.16]], tone, 0.012);
    rotate(g, -0.5, 0, 0);
    rotate(g, 0, yaw, 0);
    move(g, 0, 0.1, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

// --- Khazan's harvest farmer -------------------------------------------------

/** One small low-poly farmer figure — Khazan's Aftermath-beat "the harvest happened" walk-through. Conical Goan farmer hat, simple tan tunic. */
export function farmerFigureGeometry(): THREE.BufferGeometry {
  const legL = box(0.02, 0.11, 0.02, "#5a4632", 0);
  move(legL, -0.015, 0, 0);
  const legR = box(0.02, 0.11, 0.02, "#5a4632", 0);
  move(legR, 0.015, 0, 0);
  const torso = box(0.06, 0.1, 0.035, "#c9932e", 0.11);
  const armL = box(0.018, 0.08, 0.018, "#c9932e", 0.12);
  rotate(armL, 0, 0, 0.3);
  move(armL, -0.045, 0, 0);
  const armR = box(0.018, 0.08, 0.018, "#c9932e", 0.12);
  rotate(armR, 0, 0, -0.3);
  move(armR, 0.045, 0, 0);
  const head = dome(0.024, 0.024, 0.024, "#8a6a4a", 0.21);
  const hat = coneFrustum(0.002, 0.045, 0.05, 8, "#e7ddc8", 0.245);
  return mergeGeometries([legL, legR, torso, armL, armR, head, hat]);
}

// --- Ambient particle bursts --------------------------------------------------

/** A small scatter of particle blobs, shared shape reused for sand kick-up, spray, mist puffs, and dust — differentiated by color/scale/count at the call site, not by geometry. */
export function particleBurstGeometry(count: number, radius: number, color: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + i * 0.7;
    const r = radius * (0.4 + 0.6 * ((i * 37) % 10) / 10);
    const size = radius * (0.16 + 0.1 * ((i * 53) % 10) / 10);
    const g = box(size, size, size, color, 0);
    move(g, Math.cos(angle) * r, Math.sin(angle * 1.3) * radius * 0.3, Math.sin(angle) * r);
    parts.push(g);
  }
  return mergeGeometries(parts);
}
