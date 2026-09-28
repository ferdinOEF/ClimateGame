import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { createLandmarkGeometry } from "./landmarkGeometry";
import { HEX_SIZE } from "./terrainMeshManager";

export interface LandmarkDef {
  id: string;
  name: string;
  category: string;
  zone: string;
  icon: string;
  coord: AxialCoord;
  note?: string;
}

/**
 * STEP_PROMPT_panjim_landmark_map.md: purely decorative, static map
 * dressing — placed once at world-init from `landmarks.json`, never
 * added/removed/animated afterward (no `SettleAnimator`, no per-instance
 * tint, no `effects`). Deliberately its own small manager, not folded
 * into `ElementMeshManager`: landmarks aren't buildable/claimable/
 * destroyable, don't go through `GameState.elements`, and don't need any
 * of that manager's per-instance bookkeeping (free-index reuse, degrade
 * tint, catastrophic-failure collapse) — reusing it here would mean
 * carrying all of that machinery for a feature that never needs it.
 * One `Mesh` per landmark (not an `InstancedMesh` pool): with only a
 * handful of landmarks per icon type, plain individual meshes are simpler
 * and the performance difference is immaterial at this scale.
 */
export class LandmarkMeshManager {
  readonly group = new THREE.Group();
  private byCoord = new Map<string, LandmarkDef>();

  constructor(landmarks: LandmarkDef[], heightAt: (coord: AxialCoord) => number) {
    const geometryCache = new Map<string, THREE.BufferGeometry>();
    const materialCache = new Map<string, THREE.MeshStandardMaterial>();

    for (const landmark of landmarks) {
      let geometry = geometryCache.get(landmark.icon);
      if (!geometry) {
        geometry = createLandmarkGeometry(landmark.icon);
        geometryCache.set(landmark.icon, geometry);
      }
      let material = materialCache.get(landmark.icon);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, vertexColors: true });
        materialCache.set(landmark.icon, material);
      }

      const mesh = new THREE.Mesh(geometry, material);
      const { x, z } = axialToWorld(landmark.coord, HEX_SIZE);
      mesh.position.set(x, heightAt(landmark.coord), z);
      this.group.add(mesh);

      this.byCoord.set(`${landmark.coord.q},${landmark.coord.r}`, landmark);
    }
  }

  /**
   * Returns the landmark at `coord`, if any. `main.ts`'s `openTilePopover()`
   * checks this FIRST, before `state.elements`/`state.buildableAt()` — a
   * landmark tile never reaches the build-menu or occupant-info path at
   * all, which is what actually makes it non-claimable/non-buildable
   * (the smallest change to the existing build flow, per the doc's own
   * "whichever is the smaller change" instruction — no exclusion list
   * needed inside `GameState` itself).
   */
  at(coord: AxialCoord): LandmarkDef | undefined {
    return this.byCoord.get(`${coord.q},${coord.r}`);
  }
}
