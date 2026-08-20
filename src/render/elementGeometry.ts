import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const ICON_DEPTH = 0.09;

/**
 * v2.2 (Section 6): every element gets its own distinct, legible
 * flat-silhouette icon rather than a low-poly prop — a thin cutout standing
 * upright on its tile. The camera never rotates (pan/zoom only, Section 6),
 * so a shape's front face always reads from the same fixed angle; a 2D
 * outline (x = left/right, y = up) extruded a shallow depth along Z is
 * enough for it to read clearly as a pictogram, unlike a rotating-camera
 * game where a flat cutout would go edge-on and vanish.
 */
function flatIcon(points: [number, number][], depth = ICON_DEPTH): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** Dune: a low, smooth, rounded mound — the softest silhouette on the roster. */
function duneGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.4, 0);
  shape.quadraticCurveTo(-0.15, 0.5, 0.05, 0.48);
  shape.quadraticCurveTo(0.3, 0.44, 0.4, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: ICON_DEPTH, bevelEnabled: false });
  geometry.translate(0, 0, -ICON_DEPTH / 2);
  return geometry;
}

/** Sandy Vegetation (Pandanus): a spiky rosette of blades radiating from a low base. */
function sandyVegetationGeometry(): THREE.BufferGeometry {
  return flatIcon([
    [-0.32, 0],
    [-0.22, 0.12],
    [-0.3, 0.58],
    [-0.06, 0.18],
    [0, 0.68],
    [0.06, 0.18],
    [0.3, 0.58],
    [0.22, 0.12],
    [0.32, 0]
  ]);
}

/** Beachside Resort: a small gable-roofed cabana plus a beach-umbrella silhouette beside it. */
function beachsideResortGeometry(): THREE.BufferGeometry {
  const cabana = flatIcon([
    [-0.4, 0],
    [-0.4, 0.32],
    [-0.14, 0.32],
    [0, 0.5],
    [0.14, 0.32],
    [0.14, 0],
    [-0.14, 0]
  ]);
  const umbrellaPole = flatIcon([
    [0.28, 0],
    [0.32, 0],
    [0.32, 0.42],
    [0.28, 0.42]
  ]);
  const umbrellaCanopy = flatIcon([
    [0.05, 0.42],
    [0.3, 0.62],
    [0.55, 0.42],
    [0.46, 0.4],
    [0.3, 0.5],
    [0.14, 0.4]
  ]);
  return mergeGeometries([cabana, umbrellaPole, umbrellaCanopy]);
}

/** Seawall: a tall, straight, blocky wall on a wider base — engineered, no curves. */
function seawallGeometry(): THREE.BufferGeometry {
  return flatIcon([
    [-0.45, 0],
    [-0.45, 0.12],
    [-0.32, 0.12],
    [-0.32, 0.6],
    [0.32, 0.6],
    [0.32, 0.12],
    [0.45, 0.12],
    [0.45, 0]
  ]);
}

/** Mangrove: a rounded canopy on three splayed prop-root "legs" — organic, distinct from Dune's smooth mound. */
function mangroveGeometry(): THREE.BufferGeometry {
  return flatIcon([
    [-0.05, 0],
    [-0.3, 0.22],
    [-0.16, 0.24],
    [0, 0.05],
    [0.16, 0.24],
    [0.3, 0.22],
    [0.05, 0],
    [0.36, 0.3],
    [0.24, 0.34],
    [0.22, 0.5],
    [0.34, 0.62],
    [0.16, 0.7],
    [0, 0.66],
    [-0.16, 0.7],
    [-0.34, 0.62],
    [-0.22, 0.5],
    [-0.24, 0.34],
    [-0.36, 0.3]
  ]);
}

/** Khazan: a bund-and-sluice "gate" silhouette — a portal shape, its inner notch standing in for the sluice opening. */
function khazanGeometry(): THREE.BufferGeometry {
  return flatIcon([
    [-0.4, 0],
    [-0.4, 0.5],
    [0.4, 0.5],
    [0.4, 0],
    [0.24, 0],
    [0.24, 0.32],
    [-0.24, 0.32],
    [-0.24, 0]
  ]);
}

/** Small Dam: a low, wide barrier with a stepped spillway notch — distinct from Seawall's tall vertical block. */
function smallDamGeometry(): THREE.BufferGeometry {
  return flatIcon([
    [-0.48, 0],
    [-0.48, 0.34],
    [-0.1, 0.34],
    [-0.1, 0.2],
    [0.1, 0.2],
    [0.1, 0.34],
    [0.48, 0.34],
    [0.48, 0]
  ]);
}

/** House: a wide gable-roofed silhouette with a chimney — simpler and squatter than Resort's cabana, reads as plain residential. */
function houseGeometry(): THREE.BufferGeometry {
  const body = flatIcon([
    [-0.42, 0],
    [-0.48, 0.28],
    [0, 0.54],
    [0.48, 0.28],
    [0.42, 0],
    [0.3, 0],
    [0.3, 0.16],
    [-0.3, 0.16],
    [-0.3, 0]
  ]);
  const chimney = flatIcon([
    [0.22, 0.22],
    [0.22, 0.46],
    [0.32, 0.46],
    [0.32, 0.3]
  ]);
  return mergeGeometries([body, chimney]);
}

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  dune: duneGeometry,
  sandy_vegetation: sandyVegetationGeometry,
  beachside_resort: beachsideResortGeometry,
  seawall: seawallGeometry,
  mangrove: mangroveGeometry,
  khazan: khazanGeometry,
  small_dam: smallDamGeometry,
  house: houseGeometry
};

export function createElementGeometry(elementId: string): THREE.BufferGeometry {
  const builder = BUILDERS[elementId];
  if (!builder) throw new Error(`No geometry builder for element id: ${elementId}`);
  return builder();
}
