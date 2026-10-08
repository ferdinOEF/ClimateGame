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
  /** Wind (0–1), its direction and the clock, for the gardens' trees to bend in a storm (vertex shader; no per-frame CPU work). */
  private readonly sway = { uWind: { value: 0 }, uTime: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() } };

  constructor(town: TownLayout, heightAt: (coord: AxialCoord) => number) {
    const coordOf = (key: string): AxialCoord => {
      const [q, r] = key.split(",").map(Number);
      return { q, r };
    };

    // Gardens.
    if (town.gardens.size > 0) {
      const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, vertexColors: true });
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.sway);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nuniform float uWind;\nuniform float uTime;\nuniform vec2 uWindDir;")
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
              // Taller parts bend further, all the same way: the wind direction
              // turned into this instance's own frame, plus a gusting wobble.
              vec3 local = transpose(mat3(instanceMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y);
              vec2 dir = normalize(local.xz + vec2(0.0001));
              float h = max(0.0, position.y);
              float gust = 0.75 + 0.25 * sin(uTime * 3.1 + instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5);
              transformed.xz += dir * h * h * uWind * gust * 0.55;
            #endif`
          );
      };
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

  /** The storm's wind (0–1) and where it blows from the sea toward, for the garden trees. */
  setWind(wind: number, nowMs: number, direction?: THREE.Vector2): void {
    this.sway.uWind.value = wind;
    this.sway.uTime.value = nowMs / 1000;
    if (direction && direction.lengthSq() > 0) this.sway.uWindDir.value.copy(direction).normalize();
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
