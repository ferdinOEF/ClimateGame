import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";
import { gardenGeometry } from "./townGeometry";
import type { TownLayout } from "@levels/townLayout";

/**
 * What the town plan draws besides its buildings: the gardens on empty land.
 *
 * Roads are not drawn here. They show through the street-map layer, in OSM's
 * own colours and widths, so they fade with its opacity slider and can never
 * read as a defence, the heat or water. (Thick drawn strips did.) The road
 * data is unchanged: road tiles still refuse buildings, and the walkers still
 * follow `roadPoints`.
 *
 * One instanced mesh (gardens). Built once: the town plan never changes
 * during a run.
 */
const ROAD_LIFT = 0.006;

function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export class TownDecor {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];

  constructor(town: TownLayout, heightAt: (coord: AxialCoord) => number) {
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
