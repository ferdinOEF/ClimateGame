import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cone(radius: number, h: number, segments: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, h, segments);
  g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function cylinder(radius: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, h, 6);
  g.translate(x, y, z);
  return g;
}

/** Village Hut: a small box body with a pyramid roof — silhouette-readable at a glance. */
function villageHutGeometry(): THREE.BufferGeometry {
  const body = box(0.46, 0.32, 0.46, 0, 0.16, 0);
  const roof = cone(0.38, 0.26, 4, 0, 0.32 + 0.13, 0, Math.PI / 4);
  return mergeGeometries([body, roof]);
}

/** Paddy Field: a shallow raised patch (no per-tile texture, per Section 6). */
function paddyFieldGeometry(): THREE.BufferGeometry {
  return box(1.3, 0.07, 1.3, 0, 0.035, 0);
}

/** Coconut & Areca Grove: two simple trunk+canopy trees clustered on the tile. */
function groveGeometry(): THREE.BufferGeometry {
  const parts = [
    cylinder(0.045, 0.26, -0.26, 0.13, 0.14),
    cone(0.16, 0.32, 6, -0.26, 0.26 + 0.16, 0.14),
    cylinder(0.04, 0.22, 0.22, 0.11, -0.16),
    cone(0.14, 0.28, 6, 0.22, 0.22 + 0.14, -0.16)
  ];
  return mergeGeometries(parts);
}

/** Fishing Dock: a short plank pier with a mooring post. */
function fishingDockGeometry(): THREE.BufferGeometry {
  const plank = box(0.9, 0.05, 0.3, 0.1, 0.13, 0);
  const post = cylinder(0.035, 0.32, -0.3, 0.16, 0);
  return mergeGeometries([plank, post]);
}

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  village_hut: villageHutGeometry,
  paddy_field: paddyFieldGeometry,
  grove: groveGeometry,
  fishing_dock: fishingDockGeometry
};

export function createBuildingGeometry(buildingId: string): THREE.BufferGeometry {
  const builder = BUILDERS[buildingId];
  if (!builder) throw new Error(`No geometry builder for building id: ${buildingId}`);
  return builder();
}
