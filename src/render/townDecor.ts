import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";
import { gardenGeometry } from "./townGeometry";
import type { TownLayout } from "@levels/townLayout";

/**
 * What the town plan draws besides its buildings: the gardens on empty land,
 * and the major roads.
 *
 * Roads are strips on the hex tops along the links the map generator found
 * (where the road really runs between two neighbouring road tiles, never a
 * lattice), with a small disc at each tile's centre so bends and junctions
 * join cleanly. Where a road crosses the river
 * or a wetland it becomes a deck at land height on a pier: the bridges and
 * causeways. Light warm grey, never green, red or concrete-grey, so a road
 * never reads as a defence or as the warning heat. Under everything else: a
 * hair above the terrain, below the heat overlay and every element.
 *
 * Four instanced meshes in all (garden, strip, junction, pier). Built once:
 * the town plan never changes during a run.
 */
const ROAD = new THREE.Color("#ddd6c6");
const DECK = new THREE.Color("#cbc4b4");
const ROAD_LIFT = 0.006;
const STRIP_WIDTH = 0.2;

function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export class TownDecor {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];

  constructor(town: TownLayout, heightAt: (coord: AxialCoord) => number, landHeight: number) {
    const coordOf = (key: string): AxialCoord => {
      const [q, r] = key.split(",").map(Number);
      return { q, r };
    };

    // Gardens.
    if (town.gardens.size > 0) {
      const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, vertexColors: true });
      const gardens = new THREE.InstancedMesh(gardenGeometry(), material, town.gardens.size);
      gardens.name = "town-gardens";
      const matrix = new THREE.Matrix4();
      let i = 0;
      for (const key of town.gardens) {
        const coord = coordOf(key);
        const { x, z } = axialToWorld(coord, 1);
        const turn = seeded(key) * Math.PI * 2;
        const size = 0.85 + seeded(`${key}:s`) * 0.3;
        matrix.makeRotationY(turn).scale(new THREE.Vector3(size, size, size)).setPosition(x, heightAt(coord), z);
        gardens.setMatrixAt(i++, matrix);
      }
      gardens.instanceMatrix.needsUpdate = true;
      this.add(gardens);
    }

    // Roads and bridges.
    const network = new Set([...town.roads, ...town.bridges]);
    const segments: { x: number; y: number; z: number; angle: number; color: THREE.Color }[] = [];
    const nodes: { x: number; y: number; z: number; color: THREE.Color }[] = [];
    const piers: { x: number; z: number; bottom: number; top: number }[] = [];
    const deckY = landHeight + ROAD_LIFT * 2;
    const surface = (key: string): { x: number; y: number; z: number; color: THREE.Color } => {
      const coord = coordOf(key);
      const centre = axialToWorld(coord, 1);
      const bridge = town.bridges.has(key);
      return { x: centre.x, y: bridge ? deckY : heightAt(coord) + ROAD_LIFT, z: centre.z, color: bridge ? DECK : ROAD };
    };
    for (const key of network) {
      const at = surface(key);
      nodes.push(at);
      if (town.bridges.has(key)) {
        const coord = coordOf(key);
        piers.push({ x: at.x, z: at.z, bottom: heightAt(coord) - 0.05, top: deckY });
      }
    }
    // One strip per link, in two halves, each at its own tile's height: the
    // halves meet on the shared edge.
    for (const [a, b] of town.links) {
      const from = surface(a);
      const to = surface(b);
      const angle = Math.atan2(to.z - from.z, to.x - from.x);
      segments.push({ x: (from.x * 3 + to.x) / 4, y: from.y, z: (from.z * 3 + to.z) / 4, angle, color: from.color });
      segments.push({ x: (to.x * 3 + from.x) / 4, y: to.y, z: (to.z * 3 + from.z) / 4, angle, color: to.color });
    }
    const flat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
    if (segments.length > 0) {
      const strip = new THREE.BoxGeometry(0.9, 0.012, STRIP_WIDTH);
      const mesh = new THREE.InstancedMesh(strip, flat, segments.length);
      mesh.name = "town-road-strips";
      const matrix = new THREE.Matrix4();
      segments.forEach((s, i) => {
        // Box length runs along x; rotate it onto the segment (-angle: three's Y rotation turns x towards -z).
        matrix.makeRotationY(-s.angle).setPosition(s.x, s.y + 0.006, s.z);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, s.color);
      });
      this.add(mesh);
    }
    if (nodes.length > 0) {
      const disc = new THREE.CylinderGeometry(STRIP_WIDTH * 0.62, STRIP_WIDTH * 0.62, 0.012, 8);
      const mesh = new THREE.InstancedMesh(disc, flat, nodes.length);
      mesh.name = "town-road-junctions";
      const matrix = new THREE.Matrix4();
      nodes.forEach((n, i) => {
        mesh.setMatrixAt(i, matrix.makeTranslation(n.x, n.y + 0.006, n.z));
        mesh.setColorAt(i, n.color);
      });
      this.add(mesh);
    }
    if (piers.length > 0) {
      const pier = new THREE.BoxGeometry(0.12, 1, 0.12);
      pier.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(pier, new THREE.MeshStandardMaterial({ color: "#8e8a82", roughness: 0.9, flatShading: true }), piers.length);
      mesh.name = "town-bridge-piers";
      const matrix = new THREE.Matrix4();
      piers.forEach((p, i) => {
        matrix.makeScale(1, Math.max(0.05, p.top - p.bottom), 1).setPosition(p.x, p.bottom, p.z);
        mesh.setMatrixAt(i, matrix);
      });
      this.add(mesh);
    }
  }

  private add(mesh: THREE.InstancedMesh): void {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.meshes.push(mesh);
    this.group.add(mesh);
  }

  /** Tiles with a road on them, for anything that walks the roads. */
  static roadPoints(town: TownLayout, heightAt: (coord: AxialCoord) => number): { x: number; y: number; z: number; key: string }[] {
    return [...town.roads].map((key) => {
      const [q, r] = key.split(",").map(Number);
      const { x, z } = axialToWorld({ q, r }, 1);
      return { x, y: heightAt({ q, r }) + ROAD_LIFT, z, key };
    });
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
