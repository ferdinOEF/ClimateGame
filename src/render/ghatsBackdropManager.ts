import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { createHexPrismGeometry } from "./hexGeometry";
import { paletteColor, jitterColor, jitterScalar } from "./palette";
import { HEX_SIZE } from "./terrainMeshManager";

const COLUMN_COUNT = 4;
/** "Slowly rising": each successive column sits visibly taller than the last. */
const COLUMN_HEIGHTS = [0.9, 1.4, 2.0, 2.7];
const COLUMN_COLOR_KEYS = ["ghatsNear", "ghatsMid", "ghatsFar", "ghatsDistant"];
const HEIGHT_JITTER = 0.35; // per-tile height variance so a column reads as a ridge, not a mesa

/**
 * STEP_PROMPT_ghats_wave_demo.md Section 1: a purely cosmetic hill range
 * on the map's eastern edge — no hazard-origin alignment (Flood, the only
 * hazard that would have justified one, is off; see main.ts's
 * FLOOD_HAZARD_ENABLED), so this sits directly adjacent to the real map's
 * existing east edge, no map-data changes needed.
 *
 * Deliberately independent of `TerrainMeshManager`/`GameState`/raycasting/
 * the build system — these tiles must NEVER end up in `GameState.placed`,
 * since `resolveHazardWave()`'s BFS walks every neighbor present there
 * with no terrain-type filter on traversal, only on decay rate. A hill
 * tile sitting in `map.json`'s `tiles` array would get swept into Storm
 * Surge's BFS and show damage/overlay reveals — exactly the "no
 * functionality" promise this feature exists to keep. Reusing
 * `TerrainMeshManager`'s own instancing (or adding these coords to
 * `mapTiles` in any form) would break that promise; this manager's own
 * parallel `THREE.InstancedMesh`-per-column setup, added to the scene
 * directly (see `main.ts`), is what keeps it airtight — never on
 * `TerrainMeshManager.raycastTargets`, never given a `terrainId` any
 * element's `validTerrainIds` could reference, never touched by the
 * claim/dim system.
 */
export class GhatsBackdropManager {
  readonly group = new THREE.Group();

  /**
   * `mapTiles` is read only to find each row's real eastern edge (so the
   * backdrop's western face sits flush against it) — never written to,
   * never fed into `GameState`. Computed from the actual tile data rather
   * than reimplementing `tools/mapgen/generate.ts`'s private row-offset
   * formula (`rowQMin()`) here, since the map isn't a plain axial
   * rectangle — each row's own max `q` already accounts for that shear
   * correction, whatever the exact formula is.
   */
  constructor(mapTiles: { coord: AxialCoord; terrainId: string }[]) {
    const maxQByRow = new Map<number, number>();
    for (const t of mapTiles) {
      const current = maxQByRow.get(t.coord.r);
      if (current === undefined || t.coord.q > current) maxQByRow.set(t.coord.r, t.coord.q);
    }
    const rows = [...maxQByRow.keys()].sort((a, b) => a - b);

    for (let col = 0; col < COLUMN_COUNT; col++) {
      const height = COLUMN_HEIGHTS[col];
      const color = paletteColor(COLUMN_COLOR_KEYS[col]);
      // Unit-height geometry (base at y=0, top at y=1) — each instance's
      // own matrix scales Y to its actual jittered height, so one shared
      // geometry per column can still give every tile a slightly
      // different height without a separate geometry per tile.
      const geometry = createHexPrismGeometry(HEX_SIZE * 0.98, 1.0);
      const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, metalness: 0 });
      const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(rows.length * 3), 3);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = `ghats-col-${col}`;

      rows.forEach((r, i) => {
        const q = maxQByRow.get(r)! + 1 + col;
        const { x, z } = axialToWorld({ q, r }, HEX_SIZE);
        const seed = q * 41 + r * 23 + col * 97;
        const jitteredHeight = Math.max(0.2, height + jitterScalar(seed, HEIGHT_JITTER));
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(x, 0, z),
          new THREE.Quaternion(),
          new THREE.Vector3(1, jitteredHeight, 1)
        );
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, jitterColor(color, seed));
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.count = rows.length;
      this.group.add(mesh);
    }
  }
}
