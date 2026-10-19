import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";
import { HEX_SIZE } from "./terrainMeshManager";
import { createMonumentGeometryFor, monumentGeometryKey, MONUMENT_BUILDING_KINDS } from "./monumentGeometry";
import { monumentScale, planReach, type Size } from "./monumentScale";
import { LANDMARK_FACING } from "./landmarkModels";
import { landmarkDecals } from "./landmarkDecals";
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
 * per geometry. Since Section 18 every landmark has its own model, so that is
 * one draw call each (sixteen), plus one for the plazas and one per painted name.
 *
 * COLOUR
 *
 * Tinted near-white, for the reason `ElementMeshManager.SELF_COLOURED`
 * documents at length: `instanceColor` is multiplied against every vertex
 * colour, so a palette hue would collapse a whitewashed church with a
 * terracotta roof and teal shutters into one flat colour. The slight jitter
 * that survives is kept from the days of seven identical civic blocks.
 */

/** Monuments are placed once at boot and never again, so the pool only has to hold what a map declares. */
const MAX_INSTANCES_PER_KIND = 32;

/** Just off white, so the geometry's own colours render as authored. */
const NEUTRAL_TINT = new THREE.Color("#fdfbf6");

/**
 * How much bigger an open place (the garden, the beach, the headland) is drawn
 * than it is modelled. Their models are authored as a hexagon of ground with
 * corners 0.7 from the centre, so 1.2 lays it over most of the tile (corners at
 * 0.84 of the tile's 1.0) and leaves the tile's own rim showing.
 */
const OPEN_PLACE_SCALE = 1.2;

export interface MonumentPlacement {
  id: string;
  name: string;
  kind: string;
  coord: AxialCoord;
  /** Its category, for the name card ("Temple", "Museum, Patto"). */
  category?: string;
}

/** The plaza under a monument building: a paved hex, a little inside its tile. */
const PLAZA_RADIUS = 0.62;
const PLAZA_HEIGHT = 0.025;
const PLAZA_COLOUR = new THREE.Color("#c9bc9c");

const turnAxis = new THREE.Vector3(0, 1, 0);
const turnQuat = new THREE.Quaternion();
const scaleVec = new THREE.Vector3();
const posVec = new THREE.Vector3();

/** A monument's instance matrix: scaled (y apart), turned about y, set on its tile. */
function placement(matrix: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy: number, turn: number): THREE.Matrix4 {
  return matrix.compose(posVec.set(x, y, z), turnQuat.setFromAxisAngle(turnAxis, turn), scaleVec.set(sx, sy, sx));
}

export class MonumentMeshManager {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private readonly counts = new Map<string, number>();
  /** Coord key -> which monument stands there, for the click handler to name it. */
  private readonly byCoord = new Map<string, MonumentPlacement>();
  /** Each monument's drawn size and scale, for the tests and the QA report. */
  readonly sizes = new Map<string, { size: Size; neighbour: Size | null; sx: number; sy: number }>();
  /** Each placed monument's resting transform parts, for `setHeightGrowth`. */
  private readonly placed: { monument: MonumentPlacement; mesh: THREE.InstancedMesh; index: number; x: number; y: number; z: number; sx: number; sy: number; h: number; turn: number; growth: number; decals: THREE.Group | null }[] = [];
  /** Which monument each instance of each mesh is. */
  private readonly byInstance = new Map<THREE.Object3D, MonumentPlacement[]>();
  /** Coord key -> world Y of the top of the monument standing there. */
  private readonly tops = new Map<string, number>();

  /**
   * Builds only the geometries the given monuments actually need.
   *
   * The alternative — one mesh per known kind, always — would allocate nine
   * instanced meshes and nine merged geometries on the tutorial map, which has
   * no monuments at all.
   */
  /**
   * `neighbourAt` gives the size of the largest House on the tiles round a
   * monument (null where there is none, e.g. the beach): buildings are sized
   * against it (see monumentScale.ts). Open places (the garden, the beach,
   * the headland) take `OPEN_PLACE_SCALE`.
   */
  constructor(
    monuments: readonly MonumentPlacement[],
    heightAt: (coord: AxialCoord) => number,
    neighbourAt: (coord: AxialCoord) => Size | null = () => null
  ) {
    const kinds = [...new Set(monuments.map((monument) => monumentGeometryKey(monument.id, monument.kind)))];
    const geometryFor = new Map<string, THREE.BufferGeometry>();
    for (const monument of monuments) {
      const key = monumentGeometryKey(monument.id, monument.kind);
      if (!geometryFor.has(key)) geometryFor.set(key, createMonumentGeometryFor(monument.id, monument.kind));
    }

    for (const kind of kinds) {
      const geometry = geometryFor.get(kind)!;
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

    const buildings = monuments.filter((monument) => MONUMENT_BUILDING_KINDS.includes(monument.kind));
    const plaza = buildings.length > 0 ? new THREE.InstancedMesh(new THREE.CylinderGeometry(PLAZA_RADIUS, PLAZA_RADIUS, PLAZA_HEIGHT, 6), new THREE.MeshStandardMaterial({ color: PLAZA_COLOUR, roughness: 0.95, flatShading: true }), buildings.length) : null;
    if (plaza) {
      plaza.name = "monument-plazas";
      plaza.count = 0;
      this.group.add(plaza);
    }

    const matrix = new THREE.Matrix4();
    for (const monument of monuments) {
      const key = monumentGeometryKey(monument.id, monument.kind);
      const mesh = this.meshes.get(key);
      if (!mesh) continue;
      const index = this.counts.get(key)!;
      if (index >= MAX_INSTANCES_PER_KIND) {
        console.warn(`[monuments] more than ${MAX_INSTANCES_PER_KIND} of kind "${monument.kind}"; the rest are not drawn`);
        continue;
      }

      const { x, z } = axialToWorld(monument.coord, HEX_SIZE);
      const geometry = geometryFor.get(key)!;
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      const size: Size = { w: bounds.max.x - bounds.min.x, d: bounds.max.z - bounds.min.z, h: bounds.max.y, reach: planReach(geometry.getAttribute("position").array) };
      const isBuilding = MONUMENT_BUILDING_KINDS.includes(monument.kind);
      const neighbour = isBuilding ? neighbourAt(monument.coord) : null;
      const { sx, sy } = neighbour ? monumentScale(size, neighbour) : { sx: OPEN_PLACE_SCALE, sy: OPEN_PLACE_SCALE };
      // Its front to its real street or water where that is known, else to the default camera.
      const turn = LANDMARK_FACING[monument.id] ?? 0;
      this.sizes.set(monument.id, { size, neighbour, sx, sy });
      let y = heightAt(monument.coord);
      if (plaza && isBuilding) {
        plaza.setMatrixAt(plaza.count, matrix.makeTranslation(x, y + PLAZA_HEIGHT / 2, z));
        plaza.count += 1;
        y += PLAZA_HEIGHT;
      }
      mesh.setMatrixAt(index, placement(matrix, x, y, z, sx, sy, turn));
      const decals = landmarkDecals(monument.id);
      if (decals) {
        decals.position.set(x, y, z);
        decals.rotation.y = turn;
        decals.scale.set(sx, sy, sx);
        this.group.add(decals);
      }
      this.placed.push({ monument, mesh, index, x, y, z, sx, sy, h: size.h, turn, growth: 1, decals });
      this.tops.set(`${monument.coord.q},${monument.coord.r}`, y + size.h * sy);

      // Seeded off the coordinate so a given building looks the same every
      // time the level is loaded.
      const seed = monument.coord.q * 53 + monument.coord.r * 29;
      mesh.setColorAt(index, jitterColor(NEUTRAL_TINT, seed));

      this.counts.set(key, index + 1);
      if (!this.byInstance.has(mesh)) this.byInstance.set(mesh, []);
      this.byInstance.get(mesh)![index] = monument;
      mesh.count = index + 1;
      this.byCoord.set(`${monument.coord.q},${monument.coord.r}`, monument);
    }

    if (plaza) {
      plaza.instanceMatrix.needsUpdate = true;
      plaza.boundingSphere = null;
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /**
   * Raises each monument building by a factor (1 = as placed), so it grows
   * with the houses round it as the skyline rises over a run. Open places
   * are left alone.
   */
  setHeightGrowth(factorAt: (coord: AxialCoord) => number): void {
    const matrix = new THREE.Matrix4();
    const touched = new Set<THREE.InstancedMesh>();
    for (const p of this.placed) {
      if (!MONUMENT_BUILDING_KINDS.includes(p.monument.kind)) continue;
      const growth = factorAt(p.monument.coord);
      if (Math.abs(growth - p.growth) < 1e-3) continue;
      p.growth = growth;
      p.mesh.setMatrixAt(p.index, placement(matrix, p.x, p.y, p.z, p.sx, p.sy * growth, p.turn));
      p.decals?.scale.set(p.sx, p.sy * growth, p.sx);
      this.tops.set(`${p.monument.coord.q},${p.monument.coord.r}`, p.y + p.h * p.sy * growth);
      touched.add(p.mesh);
    }
    for (const mesh of touched) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /** The monument a raycast hit on one of its meshes belongs to, if any. */
  atHit(object: THREE.Object3D, instanceId: number): MonumentPlacement | null {
    return this.byInstance.get(object)?.[instanceId] ?? null;
  }

  /** The monument standing on a tile, if any — so a click can name it rather than opening a build menu. */
  at(coord: AxialCoord): MonumentPlacement | null {
    return this.byCoord.get(`${coord.q},${coord.r}`) ?? null;
  }

  /** The world Y of the top of the monument on a tile, or null (so its name card can sit above it). */
  topAt(coord: AxialCoord): number | null {
    return this.tops.get(`${coord.q},${coord.r}`) ?? null;
  }

  /** Every tile a monument occupies, for `GameState.reserved`. */
  occupiedKeys(): string[] {
    return [...this.byCoord.keys()];
  }
}
