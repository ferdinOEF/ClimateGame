import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";
import { HEX_SIZE } from "./terrainMeshManager";
import { createMonumentGeometry } from "./monumentGeometry";
import { jitterColor } from "./palette";

/**
 * The historic buildings that stand on the board.
 *
 * Deliberately a separate manager from `ElementMeshManager` rather than a new
 * element kind, because almost nothing the element manager does applies here.
 * Monuments are never built, never removed, never damaged, never degraded,
 * never swayed by wind, and have no slot to recycle. Folding them in would
 * have meant a `kind === "monument"` branch in each of those paths, and the
 * first one somebody forgot would be a seawall that could be demolished by
 * clicking the cathedral.
 *
 * What they share with elements is the instancing strategy: one `InstancedMesh`
 * per building type, so the seven civic blocks are a single draw call.
 *
 * COLOUR
 *
 * Tinted near-white, for the reason `ElementMeshManager.SELF_COLOURED`
 * documents at length: `instanceColor` is multiplied against every vertex
 * colour, so a palette hue would collapse a whitewashed church with a
 * terracotta roof and teal shutters into one flat colour. The slight jitter
 * that survives keeps seven identical civic blocks from looking stamped.
 */

/** Monuments are placed once at boot and never again, so the pool only has to hold what a map declares. */
const MAX_INSTANCES_PER_KIND = 32;

/** Just off white, so the geometry's own colours render as authored. */
const NEUTRAL_TINT = new THREE.Color("#fdfbf6");

/**
 * How much bigger a monument is drawn than it is modelled.
 *
 * Applied here rather than baked into each builder so one number governs all
 * nine, and so the geometries stay authored in the same units as the buildable
 * elements — which is what makes "a landmark should be clearly larger than a
 * house" a thing you can read off the code rather than infer from coordinates.
 *
 * 1.4 puts the largest footprint at about 0.55 either side of the tile centre,
 * comfortably inside the hex's 0.87 inradius, while making the buildings fill
 * enough of their tile to be recognisable at the zoom the board is usually
 * played at. The first render used 1.0 and they read as models on a plinth.
 */
const MONUMENT_SCALE = 1.4;

export interface MonumentPlacement {
  id: string;
  name: string;
  kind: string;
  coord: AxialCoord;
}

export class MonumentMeshManager {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private readonly counts = new Map<string, number>();
  /** Coord key -> which monument stands there, for the click handler to name it. */
  private readonly byCoord = new Map<string, MonumentPlacement>();

  /**
   * Builds only the geometries the given monuments actually need.
   *
   * The alternative — one mesh per known kind, always — would allocate nine
   * instanced meshes and nine merged geometries on the tutorial map, which has
   * no monuments at all.
   */
  constructor(monuments: readonly MonumentPlacement[], heightAt: (coord: AxialCoord) => number) {
    const kinds = [...new Set(monuments.map((monument) => monument.kind))];

    for (const kind of kinds) {
      const geometry = createMonumentGeometry(kind);
      const material = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.82,
        // The geometries bake real per-part colour, same as the element props.
        vertexColors: true
      });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES_PER_KIND);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES_PER_KIND * 3), 3);
      mesh.count = 0;
      mesh.name = `monument-${kind}`;
      this.meshes.set(kind, mesh);
      this.counts.set(kind, 0);
      this.group.add(mesh);
    }

    const matrix = new THREE.Matrix4();
    for (const monument of monuments) {
      const mesh = this.meshes.get(monument.kind);
      if (!mesh) continue;
      const index = this.counts.get(monument.kind)!;
      if (index >= MAX_INSTANCES_PER_KIND) {
        console.warn(`[monuments] more than ${MAX_INSTANCES_PER_KIND} of kind "${monument.kind}"; the rest are not drawn`);
        continue;
      }

      const { x, z } = axialToWorld(monument.coord, HEX_SIZE);
      mesh.setMatrixAt(
        index,
        matrix.makeScale(MONUMENT_SCALE, MONUMENT_SCALE, MONUMENT_SCALE).setPosition(x, heightAt(monument.coord), z)
      );

      // Seeded off the coordinate so a given building looks the same every
      // time the level is loaded.
      const seed = monument.coord.q * 53 + monument.coord.r * 29;
      mesh.setColorAt(index, jitterColor(NEUTRAL_TINT, seed));

      this.counts.set(monument.kind, index + 1);
      mesh.count = index + 1;
      this.byCoord.set(`${monument.coord.q},${monument.coord.r}`, monument);
    }

    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /** The monument standing on a tile, if any — so a click can name it rather than opening a build menu. */
  at(coord: AxialCoord): MonumentPlacement | null {
    return this.byCoord.get(`${coord.q},${coord.r}`) ?? null;
  }

  /** Every tile a monument occupies, for `GameState.reserved`. */
  occupiedKeys(): string[] {
    return [...this.byCoord.keys()];
  }
}
