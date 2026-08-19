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

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  mangrove_buffer: mangroveBufferGeometry,
  riparian_forest_buffer: riparianForestBufferGeometry,
  river_embankment: riverEmbankmentGeometry,
  khazan: khazanGeometry
};

export function createDefenseGeometry(defenseId: string): THREE.BufferGeometry {
  const builder = BUILDERS[defenseId];
  if (!builder) throw new Error(`No geometry builder for defense id: ${defenseId}`);
  return builder();
}
