import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialKey, axialToWorld, neighbors } from "@core/hex";
import { reliefLift } from "@core/relief";
import { TERRAIN_BY_ID } from "@core/terrain";
import { createHexPrismGeometry } from "./hexGeometry";
import { PALETTE, paletteColor } from "./palette";
import { HEX_SIZE } from "./terrainMeshManager";
import { patchForOverlay, type OverlayUniforms } from "./mapOverlayShader";

/**
 * The ground past the edge of play, so the board dissolves into its
 * surroundings instead of ending in a straight cut.
 *
 * The board used to stop dead: a vertical wall of sea tiles on the west and
 * south, and on the east a four-column ramp of dark green and grey hexes (the
 * old Western Ghats backdrop) that rose to nearly three units in four steps.
 * At full zoom-out both read as the edge of a slab rather than the edge of a
 * view.
 *
 * This adds `RINGS` rings of decorative hexes all round the board. Each one
 * continues whatever it touches:
 *
 *   - **Water** (sea, river, estuary): the hex sinks a little more and its
 *     colour blends further into the sky colour with every ring, and outer
 *     rings are thinned out by a noise test, so the sea frays into the
 *     background along an irregular line rather than a straight one.
 *   - **Land**: the ground rises gradually into hills, from the board's own
 *     land colour through the Ghats greens to the distant blue-grey, with
 *     jittered heights so it reads as a ridge line, not a staircase.
 *
 * None of it is playable or clickable, and none of it covers a playable tile:
 * the board's own tiles are unchanged. Nothing here is fog. The colour blend
 * is fixed per hex, so the board itself stays crisp at every zoom.
 */

/** How many rings of skirt surround the board. */
const RINGS = 6;
/** World units each water ring sinks below the last. */
const SEA_SINK_PER_RING = 0.05;
/**
 * Peak height the land ramp reaches at the outer ring, above the board's land
 * height. Modest on purpose: the camera looks north, so hills on the north
 * edge face it side-on, and anything taller reads as a wall across the map.
 */
const HILL_RISE = 1.0;
const HILL_JITTER = 0.3;
/** World units between noise lattice points: big enough that the ragged edge comes in coves and spits, not single loose hexes. */
const NOISE_SCALE = 3.2;

const WATER = new Set(["coast", "river", "estuary"]);

/** Deterministic hash in [0, 1), so the frayed edge is the same on every load. */
function hash01(q: number, r: number, salt: number): number {
  let h = (q * 374761393 + r * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth value noise in [0, 1) over world x/z. Neighbouring hexes get similar
 * values, so the frayed edge is a coherent ragged shoreline rather than
 * scattered single hexes.
 */
function valueNoise(x: number, z: number, salt: number): number {
  const gx = x / NOISE_SCALE;
  const gz = z / NOISE_SCALE;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const fx = smoothstep(gx - x0);
  const fz = smoothstep(gz - z0);
  const a = hash01(x0, z0, salt);
  const b = hash01(x0 + 1, z0, salt);
  const c = hash01(x0, z0 + 1, salt);
  const d = hash01(x0 + 1, z0 + 1, salt);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

interface SkirtTile {
  coord: AxialCoord;
  ring: number;
  /** The terrain of the board tile it continues. */
  terrainId: string;
  /** Relief lift carried out from that board tile (0 on flat maps). */
  lift: number;
  /** The grey of the scenery board tile it continues (render/sceneryGrey.ts); 0 off scenery. */
  grey: number;
}

/**
 * Which hexes surround the board, ring by ring, and what each continues.
 *
 * Exported so the tests can check the rule that matters most: no skirt hex is
 * ever a board hex.
 */
export function skirtTiles(
  board: readonly { coord: AxialCoord; terrainId: string; elevationM?: number; scenery?: boolean }[],
  rings = RINGS,
  /** The map's `skirtOpenSeaWestFromRow`: west of the board from this row south is open sea. */
  openSeaWestFromRow?: number
): SkirtTile[] {
  const terrainByKey = new Map(board.map((tile) => [axialKey(tile.coord), tile.terrainId]));
  const seen = new Set(terrainByKey.keys());
  // The skirt beyond a scenery bank stays as quiet as the bank (full grey, not the edge's fade).
  const scenery = new Set(board.filter((tile) => tile.scenery).map((tile) => axialKey(tile.coord)));
  let frontier: { coord: AxialCoord; terrainId: string; lift: number; grey: number }[] = board.map((tile) => ({ coord: tile.coord, terrainId: tile.terrainId, lift: tile.terrainId === "land" ? reliefLift(tile.elevationM) : 0, grey: scenery.has(axialKey(tile.coord)) ? 1 : 0 }));
  const out: SkirtTile[] = [];

  for (let ring = 1; ring <= rings; ring++) {
    const next: { coord: AxialCoord; terrainId: string; lift: number; grey: number }[] = [];
    for (const from of frontier) {
      for (const coord of neighbors(from.coord)) {
        const key = axialKey(coord);
        if (seen.has(key)) continue;
        seen.add(key);
        // West of the board's edge and south of the Mandovi's mouth is the open
        // Arabian Sea: land there (the Dona Paula headland the owner added in
        // Section 11) goes one ring out, its tip, and then the skirt is sea.
        // Its tip is drawn flat: the ring of sea beyond would leave a raised tip standing as a column.
        const westSea = openSeaWestFromRow !== undefined && !WATER.has(from.terrainId) && coord.q + coord.r / 2 < 0 && coord.r >= openSeaWestFromRow;
        const tile = westSea && ring >= 2
          ? { coord, terrainId: "coast", lift: 0, grey: 0 }
          : { coord, terrainId: from.terrainId, lift: westSea ? 0 : from.lift, grey: from.grey };
        next.push(tile);
        out.push({ ...tile, ring });
      }
    }
    frontier = next;
  }
  return out;
}

export class BoardSkirtManager {
  readonly group = new THREE.Group();

  /**
   * `clean` (Section 14, Panaji): the water past the edge stays sea, level and
   * unbroken, instead of sinking in steps and fading into the sky through
   * frayed grey "ghost" hexes; `colors` are the level's terrain colours.
   */
  constructor(
    board: readonly { coord: AxialCoord; terrainId: string; elevationM?: number; scenery?: boolean }[],
    overlay: OverlayUniforms,
    openSeaWestFromRow?: number,
    options: { clean?: boolean; colors?: ReadonlyMap<string, THREE.Color> } = {}
  ) {
    const sky = PALETTE.sky.clone();
    const hillStops = [paletteColor("landGreen"), paletteColor("ghatsNear"), paletteColor("ghatsMid"), paletteColor("ghatsFar"), paletteColor("ghatsDistant")];

    const sea: { matrix: THREE.Matrix4; color: THREE.Color; fade: number; grey: number }[] = [];
    const land: { matrix: THREE.Matrix4; color: THREE.Color; fade: number; grey: number }[] = [];

    for (const tile of skirtTiles(board, RINGS, openSeaWestFromRow)) {
      const t = tile.ring / (RINGS + 1);
      const { x, z } = axialToWorld(tile.coord, HEX_SIZE);
      const baseHeight = TERRAIN_BY_ID.get(tile.terrainId)?.height ?? 0.3;

      // Fray the outer rings: from ring 3 out, a hex is left out when the
      // noise at its position is below a bar that rises with distance, so the
      // edge is a ragged line of coves and spits.
      const fray = (tile.ring - 2) / (RINGS - 1);
      const water = WATER.has(tile.terrainId);
      // Clean (Panaji): no fraying anywhere, so no loose grey hexes at the edge.
      if (tile.ring >= 3 && valueNoise(x, z, 1) < fray && !options.clean) continue;

      if (water) {
        const own = options.colors?.get(tile.terrainId) ?? paletteColor(TERRAIN_BY_ID.get(tile.terrainId)?.colorKey ?? "seaTurquoise");
        if (options.clean) {
          // Level, and the sea's own colour a touch deeper with distance: no steps, no grey.
          const color = own.clone().multiplyScalar(1 - 0.04 * tile.ring);
          sea.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(1, Math.max(0.04, baseHeight), 1)), color, fade: 0, grey: tile.grey });
          continue;
        }
        const height = Math.max(0.04, baseHeight - tile.ring * SEA_SINK_PER_RING);
        const color = own.clone().lerp(sky, Math.pow(t, 0.85));
        sea.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, -tile.ring * 0.02, z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1)), color, fade: t, grey: tile.grey });
      } else {
        const rise = smoothstep(tile.ring / RINGS) * HILL_RISE;
        const jitter = (valueNoise(x, z, 2) - 0.5) * 2 * HILL_JITTER * smoothstep(tile.ring / RINGS);
        const height = baseHeight + tile.lift + rise + jitter;
        // Colour walks the hill stops with distance, landGreen at the board,
        // then the outer rings take on some of the sky so the ridge recedes
        // instead of ending on a dark silhouette.
        const stop = Math.min(hillStops.length - 1.001, (tile.ring / RINGS) * (hillStops.length - 1));
        const color = hillStops[Math.floor(stop)]
          .clone()
          .lerp(hillStops[Math.floor(stop) + 1], stop - Math.floor(stop))
          .lerp(sky, options.clean ? 0 : smoothstep((tile.ring - 3) / 3) * 0.5);
        land.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1)), color, fade: t, grey: tile.grey });
      }
    }

    this.addMesh("skirt-sea", sea, overlay, 0.27);
    this.addMesh("skirt-land", land, overlay, 1.0);
  }

  private addMesh(
    name: string,
    tiles: { matrix: THREE.Matrix4; color: THREE.Color; fade: number; grey: number }[],
    overlay: OverlayUniforms,
    strength: number
  ): void {
    if (tiles.length === 0) return;
    // Height 1, scaled per instance: one geometry serves every height.
    const geometry = createHexPrismGeometry(HEX_SIZE * 0.98, 1);
    geometry.setAttribute("aFade", new THREE.InstancedBufferAttribute(new Float32Array(tiles.map((tile) => tile.fade)), 1));
    geometry.setAttribute("aGrey", new THREE.InstancedBufferAttribute(new Float32Array(tiles.map((tile) => tile.grey)), 1));
    const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, metalness: 0 });
    patchForOverlay(material, overlay, strength, { fadeAttribute: true, greyAttribute: true });
    const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(tiles.length * 3), 3);
    tiles.forEach((tile, i) => {
      mesh.setMatrixAt(i, tile.matrix);
      mesh.setColorAt(i, tile.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = name;
    this.group.add(mesh);
  }
}
