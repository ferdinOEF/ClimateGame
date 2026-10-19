import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";
import { HEX_SIZE } from "./terrainMeshManager";
import { createMonumentGeometryFor, monumentGeometryKey, MONUMENT_BUILDING_KINDS } from "./monumentGeometry";
import { monumentScale, planReach, type Size } from "./monumentScale";
import { LANDMARK_FACING } from "./landmarkModels";
import { landmarkDecals } from "./landmarkDecals";
import { damagedLandmarkGeometry, landmarkRubble } from "./landmarkDamageGeometry";
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

/** What a storm leaves on a landmark: soot and wet stone. */
const DAMAGE_TINT = new THREE.Color("#5a5048");
const RUBBLE_MATERIAL = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, vertexColors: true });

export class MonumentMeshManager {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private readonly counts = new Map<string, number>();
  /** Coord key -> which monument stands there, for the click handler to name it. */
  private readonly byCoord = new Map<string, MonumentPlacement>();
  /** Each monument's drawn size and scale, for the tests and the QA report. */
  readonly sizes = new Map<string, { size: Size; neighbour: Size | null; sx: number; sy: number }>();
  /** Each placed monument's resting transform parts, for `setHeightGrowth`. */
  private readonly placed: { monument: MonumentPlacement; mesh: THREE.InstancedMesh; index: number; x: number; y: number; z: number; sx: number; sy: number; h: number; turn: number; growth: number; decals: THREE.Group | null; damage: 0 | 1 | 2; rubble: THREE.Mesh | null }[] = [];
  /** Each geometry as first built, so a damaged one is always made from the whole model. */
  private readonly baseGeometry = new Map<THREE.InstancedMesh, THREE.BufferGeometry>();
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
      this.placed.push({ monument, mesh, index, x, y, z, sx, sy, h: size.h, turn, growth: 1, decals, damage: 0, rubble: null });
      if (!this.baseGeometry.has(mesh)) this.baseGeometry.set(mesh, geometry);
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
      if (p.damage > 0) this.writeMatrix(p);
      else p.mesh.setMatrixAt(p.index, placement(matrix, p.x, p.y, p.z, p.sx, p.sy * growth, p.turn));
      p.decals?.scale.set(p.sx, p.sy * growth, p.sx);
      this.tops.set(`${p.monument.coord.q},${p.monument.coord.r}`, p.y + p.h * p.sy * growth);
      touched.add(p.mesh);
    }
    for (const mesh of touched) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /**
   * Section 21.3: a landmark the storm damaged (1) or destroyed (2) shows it for the rest of the run: its own model
   * with soot and crack streaks and a caved-in section of roof (wider when destroyed), darker, rubble at its foot; a
   * destroyed one also settles and leans a little. Damage only ever gets worse. Open places (the garden, the beach,
   * the headland) only take the rubble and the darkening. `exact` sets the level as given (a rewind or a resume),
   * else it only ever rises.
   */
  setDamage(coord: AxialCoord, level: 0 | 1 | 2, exact = false): void {
    const p = this.placed.find((x) => x.monument.coord.q === coord.q && x.monument.coord.r === coord.r);
    if (!p || level === p.damage || (!exact && level < p.damage)) return;
    p.damage = level;
    if (level === 0) {
      // A rewind to before the storm: the landmark whole again.
      const base = this.baseGeometry.get(p.mesh);
      if (base && p.mesh.geometry !== base) {
        p.mesh.geometry.dispose();
        p.mesh.geometry = base;
      }
      p.mesh.setColorAt(p.index, jitterColor(NEUTRAL_TINT, coord.q * 53 + coord.r * 29));
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      this.writeMatrix(p);
      if (p.rubble) {
        this.group.remove(p.rubble);
        p.rubble.geometry.dispose();
        p.rubble = null;
      }
      return;
    }
    const seed = coord.q * 31 + coord.r * 17;
    const isBuilding = MONUMENT_BUILDING_KINDS.includes(p.monument.kind);
    const base = this.baseGeometry.get(p.mesh);
    if (isBuilding && base && level > 0) {
      const old = p.mesh.geometry;
      p.mesh.geometry = damagedLandmarkGeometry(base, level as 1 | 2, seed);
      if (old !== base) old.dispose();
    }
    p.mesh.setColorAt(p.index, jitterColor(NEUTRAL_TINT, coord.q * 53 + coord.r * 29).lerp(DAMAGE_TINT, level === 2 ? 0.45 : 0.25));
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    this.writeMatrix(p);
    if (p.rubble) {
      this.group.remove(p.rubble);
      p.rubble.geometry.dispose();
    }
    p.rubble = new THREE.Mesh(landmarkRubble(level as 1 | 2, seed), RUBBLE_MATERIAL);
    p.rubble.name = "monument-rubble";
    p.rubble.position.set(p.x, p.y, p.z);
    p.rubble.scale.setScalar(p.sx);
    p.rubble.raycast = () => undefined;
    this.group.add(p.rubble);
  }

  /** Each landmark's damage now (0 standing, 1 damaged, 2 destroyed), for the tests and the QA report. */
  damageOf(coord: AxialCoord): 0 | 1 | 2 {
    return this.placed.find((x) => x.monument.coord.q === coord.q && x.monument.coord.r === coord.r)?.damage ?? 0;
  }

  /** A landmark's instance matrix as it stands: its scale, growth and turn, and a destroyed one's settle and lean. */
  private writeMatrix(p: (typeof this.placed)[number]): void {
    const matrix = placement(new THREE.Matrix4(), p.x, p.y, p.z, p.sx, p.sy * p.growth * (p.damage === 2 ? 0.88 : 1), p.turn);
    if (p.damage === 2) matrix.multiply(new THREE.Matrix4().makeRotationX(0.06));
    p.mesh.setMatrixAt(p.index, matrix);
    p.mesh.instanceMatrix.needsUpdate = true;
    p.mesh.boundingSphere = null;
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
