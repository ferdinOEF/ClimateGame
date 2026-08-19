import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function box(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function cone(radius: number, h: number, segments: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, h, segments);
  g.translate(x, y, z);
  return g;
}

function squashedSphere(radius: number, squash: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, 8, 5);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return g;
}

/** Mangrove Buffer: a cluster of low, twisted shrub blobs fringing the tile. */
function mangroveBufferGeometry(): THREE.BufferGeometry {
  const spots: [number, number][] = [
    [-0.28, 0.2],
    [0.05, 0.3],
    [0.3, 0.05],
    [-0.1, -0.25]
  ];
  const parts = spots.map(([x, z]) => cone(0.16, 0.22, 5, x, 0.11, z));
  return mergeGeometries(parts);
}

/** Riparian Forest Buffer: a denser line of trees along one edge, a "hedge" against the river. */
function riparianForestBufferGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = -1; i <= 1; i++) {
    const x = i * 0.28;
    parts.push(box(0.05, 0.2, 0.05, x, 0.1, 0.3));
    parts.push(cone(0.15, 0.26, 6, x, 0.2 + 0.13, 0.3));
  }
  return mergeGeometries(parts);
}

/** River Embankment: a raised, angular concrete ridge — engineered, not organic. */
function riverEmbankmentGeometry(): THREE.BufferGeometry {
  const wall = box(1.5, 0.32, 0.26, 0, 0.16, 0.32);
  const base = box(1.6, 0.1, 0.4, 0, 0.05, 0.32);
  return mergeGeometries([wall, base]);
}

/** Khazan: a low earthen bund ring with a small sluice-gate marker. */
function khazanGeometry(): THREE.BufferGeometry {
  const sides: THREE.BufferGeometry[] = [
    box(1.55, 0.22, 0.22, 0, 0.11, 0.55),
    box(1.55, 0.22, 0.22, 0, 0.11, -0.55),
    box(0.22, 0.22, 1.0, 0.62, 0.11, 0),
    box(0.22, 0.22, 1.0, -0.62, 0.11, 0)
  ];
  const gate = box(0.22, 0.3, 0.14, 0, 0.15, 0.55);
  return mergeGeometries([...sides, gate]);
}

/** Coastal Dune & Windbreak: a low sandy mound with a few wind-bent grass tufts. */
function coastalDuneGeometry(): THREE.BufferGeometry {
  const mound = squashedSphere(0.42, 0.45, 0, 0.12, 0);
  const tufts = [
    cone(0.05, 0.22, 4, -0.15, 0.28, 0.05),
    cone(0.05, 0.2, 4, 0.1, 0.26, -0.1),
    cone(0.04, 0.18, 4, 0.2, 0.24, 0.12)
  ];
  return mergeGeometries([mound, ...tufts]);
}

/** Seawall: taller and more imposing than the river embankment — the coast's hard engineered line. */
function seawallGeometry(): THREE.BufferGeometry {
  const wall = box(1.55, 0.5, 0.24, 0, 0.25, 0.34);
  const base = box(1.65, 0.12, 0.4, 0, 0.06, 0.34);
  return mergeGeometries([wall, base]);
}

/** Cyclone Shelter: a small flat-roofed refuge with a high-visibility flag — protects people, not land. */
function cycloneShelterGeometry(): THREE.BufferGeometry {
  const body = box(0.52, 0.34, 0.52, 0, 0.17, 0);
  const roof = box(0.6, 0.05, 0.6, 0, 0.365, 0);
  const pole = cone(0.02, 0.3, 4, 0, 0.34 + 0.15, 0);
  const flag = box(0.16, 0.1, 0.02, 0.08, 0.34 + 0.26, 0);
  return mergeGeometries([body, roof, pole, flag]);
}

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  mangrove_buffer: mangroveBufferGeometry,
  riparian_forest_buffer: riparianForestBufferGeometry,
  river_embankment: riverEmbankmentGeometry,
  khazan: khazanGeometry,
  coastal_dune_windbreak: coastalDuneGeometry,
  seawall: seawallGeometry,
  cyclone_shelter: cycloneShelterGeometry
};

export function createDefenseGeometry(defenseId: string): THREE.BufferGeometry {
  const builder = BUILDERS[defenseId];
  if (!builder) throw new Error(`No geometry builder for defense id: ${defenseId}`);
  return builder();
}
