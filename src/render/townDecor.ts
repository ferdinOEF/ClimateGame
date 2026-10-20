import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { axialToWorld, type AxialCoord } from "@core/hex";
import { gardenGeometry } from "./townGeometry";
import { box, move } from "./primitives3d";
import { bridgeSpans, type TownLayout } from "@levels/townLayout";
import { SCENERY_GREY_FRAGMENT_DECL, SCENERY_GREY_GLSL, SCENERY_GREY_VERTEX, SCENERY_GREY_VERTEX_DECL } from "./sceneryGrey";

/**
 * What the town plan draws besides its buildings: the gardens on empty land,
 * and a deck on each bridge (Section 23b) so the walkers who cross it are
 * seen on a bridge, not on the water.
 *
 * Roads are not drawn here. They show through the street-map layer, in OSM's
 * own colours and widths, so they fade with its opacity slider and can never
 * read as a defence, the heat or water. (Thick drawn strips did.) The road
 * data is unchanged: road tiles still refuse buildings, and the walkers still
 * follow `roadPoints`.
 *
 * One instanced mesh (gardens) and one merged mesh (the few bridge decks).
 * Built once: the town plan never changes during a run.
 */
const ROAD_LIFT = 0.006;
/** A deck's width: the walkers keep 0.06 to one side and are about 0.06 wide. */
const DECK_WIDTH = 0.28;
const DECK_THICKNESS = 0.03;
/** How far a deck runs onto its bank past the shared edge, so it meets the road. */
const DECK_OVERLAP = 0.08;

function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export class TownDecor {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  /** The bridge decks, if any are drawn. */
  private decks: THREE.Mesh | null = null;
  /** Wind (0–1), its direction and the clock, for the gardens' trees to bend in a storm (vertex shader; no per-frame CPU work). */
  private readonly sway = { uWind: { value: 0 }, uTime: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() } };

  /** `greyAt`: a scenery tile's grey level (render/sceneryGrey.ts), so the gardens there are as quiet as the ground. */
  /**
   * `bridges`: each tile's terrain and the deck's height (the walkers walk a
   * bridge at the land's height, `AmbientLife`). Without it no deck is drawn.
   */
  constructor(
    town: TownLayout,
    heightAt: (coord: AxialCoord) => number,
    greyAt: (key: string) => number = () => 0,
    bridges?: { terrainOf: (key: string) => string | undefined; deckY: number }
  ) {
    const coordOf = (key: string): AxialCoord => {
      const [q, r] = key.split(",").map(Number);
      return { q, r };
    };

    // Gardens.
    if (town.gardens.size > 0) {
      const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, vertexColors: true });
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.sway);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>\n${SCENERY_GREY_FRAGMENT_DECL}`)
          .replace("#include <color_fragment>", `#include <color_fragment>\n${SCENERY_GREY_GLSL}`);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\nuniform float uWind;\nuniform float uTime;\nuniform vec2 uWindDir;\n${SCENERY_GREY_VERTEX_DECL}`)
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            ${SCENERY_GREY_VERTEX}
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
      const geometry = gardenGeometry();
      geometry.setAttribute("aGrey", new THREE.InstancedBufferAttribute(new Float32Array([...town.gardens].map((key) => greyAt(key))), 1));
      const gardens = new THREE.InstancedMesh(geometry, material, town.gardens.size);
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

    // Bridge decks: from each bank's edge across the bridge tile to its
    // centre, with a low parapet each side and a pier under the middle.
    const spans = bridges ? bridgeSpans(town, bridges.terrainOf) : new Map<string, string[]>();
    if (bridges && spans.size > 0) {
      const parts: THREE.BufferGeometry[] = [];
      const top = bridges.deckY;
      for (const [key, banks] of spans) {
        const centre = axialToWorld(coordOf(key), 1);
        for (const bank of banks) {
          const end = axialToWorld(coordOf(bank), 1);
          const angle = Math.atan2(end.x - centre.x, end.z - centre.z);
          // Centre to the shared edge is half the distance between centres.
          const length = Math.hypot(end.x - centre.x, end.z - centre.z) / 2 + DECK_OVERLAP;
          const half = [
            box(DECK_WIDTH, DECK_THICKNESS, length, "#b8ad99", top - DECK_THICKNESS),
            move(box(0.025, 0.035, length, "#e8e1d0", top), DECK_WIDTH / 2 - 0.0125, 0, 0),
            move(box(0.025, 0.035, length, "#e8e1d0", top), -DECK_WIDTH / 2 + 0.0125, 0, 0)
          ].map((g) => g.translate(0, 0, length / 2).rotateY(angle).translate(centre.x, 0, centre.z));
          parts.push(...half);
        }
        parts.push(move(box(0.12, top - DECK_THICKNESS, 0.12, "#8f8676", 0), centre.x, 0, centre.z));
      }
      const deck = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, vertexColors: true }));
      deck.name = "town-bridges";
      this.decks = deck;
      this.group.add(deck);
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
    for (const mesh of [...this.meshes, ...(this.decks ? [this.decks] : [])]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
