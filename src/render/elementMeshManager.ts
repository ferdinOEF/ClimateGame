import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { ELEMENT_DEFS, ELEMENT_BY_ID } from "@core/elements";
import { HEX_SIZE } from "./terrainMeshManager";
import { createElementGeometry } from "./elementGeometry";
import { jitterColor, paletteColor } from "./palette";
import { SettleAnimator } from "./settleAnimation";

const MAX_INSTANCES_PER_TYPE = 200;
const DEGRADED_TINT = new THREE.Color("#5b4a36"); // dull, patchy brown — a visibly weakened structure

interface ElementInstanceRef {
  elementId: string;
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  y: number;
  z: number;
  baseColor: THREE.Color;
}

/**
 * v2.2: buildings and defenses merged into one `elements.json` roster
 * (Section 0.1's generic-effects requirement), so their render-side
 * bookkeeping — near-identical between the old BuildingMeshManager and
 * DefenseMeshManager — merges into one manager too. One InstancedMesh per
 * element type, small flat-silhouette icon props sitting on their tile.
 * `destroy()`/`setDegradeVisual()` only ever get called for defense-kind
 * elements in practice (a hazard event), but work uniformly either way.
 */
export class ElementMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  /** High-water mark per type — only ever grows, capped at MAX_INSTANCES_PER_TYPE. */
  private nextIndex = new Map<string, number>();
  /** Indices freed by destroy() — drawn from before nextIndex grows further. */
  private freeIndices = new Map<string, number[]>();
  private byCoord = new Map<string, ElementInstanceRef>();
  private animator = new SettleAnimator();

  constructor() {
    for (const element of ELEMENT_DEFS) {
      const geometry = createElementGeometry(element.id);
      // vertexColors: true — the element-icon redesign pass bakes real
      // per-part color into each geometry's `color` attribute (see
      // primitives3d.ts), which Three.js multiplies against the
      // per-instance `instanceColor` set below (jitterColor's subtle
      // per-tile variation still applies on top of every part uniformly).
      const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, vertexColors: true });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES_PER_TYPE);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES_PER_TYPE * 3), 3);
      mesh.count = 0;
      mesh.name = `element-${element.id}`;
      this.meshes.set(element.id, mesh);
      this.nextIndex.set(element.id, 0);
      this.freeIndices.set(element.id, []);
      this.group.add(mesh);
    }
  }

  /**
   * STEP_PROMPT_gameplay_stability_test.md Part A: `index` used to be a
   * strictly-increasing per-type counter that never gave back a destroyed
   * instance's slot — live-reproduced that a rapid rebuild/catastrophic-
   * failure cycle on the same tile (a real scenario once a Storm Surge can
   * repeatedly breach a rebuilt Seawall) hits MAX_INSTANCES_PER_TYPE and
   * throws well within a single era, uncaught, from inside the build
   * popover's click handler — which aborts that handler before it reaches
   * `this.hide()`, leaving the modal backdrop stuck open and the game
   * reading as hung. Now draws from `freeIndices` (populated by `destroy()`)
   * before growing `nextIndex`, so a destroyed instance's slot is actually
   * reusable instead of burning one more of the fixed 200 forever.
   */
  place(coord: AxialCoord, elementId: string, terrainTopY: number, options: { animate?: boolean } = {}): void {
    const def = ELEMENT_BY_ID.get(elementId);
    if (!def) throw new Error(`Unknown element id: ${elementId}`);
    const mesh = this.meshes.get(elementId)!;
    const free = this.freeIndices.get(elementId)!;
    let index: number;
    if (free.length > 0) {
      index = free.pop()!;
    } else {
      index = this.nextIndex.get(elementId)!;
      if (index >= MAX_INSTANCES_PER_TYPE) throw new Error(`Element instance cap exceeded for ${elementId}`);
      this.nextIndex.set(elementId, index + 1);
    }

    const { x, z } = axialToWorld(coord, HEX_SIZE);

    if (options.animate) {
      this.animator.begin(mesh, index, x, z, terrainTopY, performance.now());
    } else {
      mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, terrainTopY, z));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }

    const seed = coord.q * 41 + coord.r * 19;
    const baseColor = jitterColor(paletteColor(def.colorKey), seed);
    mesh.setColorAt(index, baseColor);

    mesh.count = Math.max(mesh.count, index + 1);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.byCoord.set(`${coord.q},${coord.r}`, { elementId, mesh, index, x, y: terrainTopY, z, baseColor });
  }

  /** Catastrophic engineered failure: collapses and permanently hides the instance, freeing its slot for reuse. */
  destroy(coord: AxialCoord): void {
    const key = `${coord.q},${coord.r}`;
    const ref = this.byCoord.get(key);
    if (!ref) return;
    this.animator.collapse(ref.mesh, ref.index, ref.x, ref.y, ref.z, performance.now());
    this.byCoord.delete(key);
    this.freeIndices.get(ref.elementId)!.push(ref.index);
  }

  /** Khazan graceful degrade: tints the structure toward a patchy, weathered brown as degradeAmount grows. */
  setDegradeVisual(coord: AxialCoord, degradeAmount: number): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref) return;
    const t = THREE.MathUtils.clamp(degradeAmount / 0.5, 0, 1);
    const tinted = ref.baseColor.clone().lerp(DEGRADED_TINT, t * 0.7);
    ref.mesh.setColorAt(ref.index, tinted);
    if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true;
  }

  /**
   * STEP_PROMPT_test_slider_resort_damage.md Section 3: House/Beachside
   * Resort took real Storm Surge damage (a discrete "this building was
   * hit" state, not a defense's gradual wear) — reuses `setDegradeVisual`'s
   * own tint-toward-`DEGRADED_TINT` blend math at its own maximum (the same
   * 0.7 ceiling a fully degraded defense reaches), rather than a second,
   * separately named color for the same visual idea. Kept as its own
   * method (not `setDegradeVisual(coord, 0.5)` with a magic number) since
   * that method's own name/doc comment are specifically about graceful
   * defense degradation — persists until `destroy()`/`place()` (a rebuild)
   * or `reset()` (a new era) restores the clean `baseColor`; there's no
   * repair mechanic in this codebase to clear it any other way.
   */
  setBuildingDamagedVisual(coord: AxialCoord): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref) return;
    const tinted = ref.baseColor.clone().lerp(DEGRADED_TINT, 0.7);
    ref.mesh.setColorAt(ref.index, tinted);
    if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true;
  }

  tick(nowMs: number): void {
    this.animator.tick(nowMs);
  }

  /** Clears every placed element (a new era starting a fresh map). */
  reset(): void {
    this.byCoord.clear();
    for (const elementId of this.nextIndex.keys()) {
      this.nextIndex.set(elementId, 0);
      this.freeIndices.set(elementId, []);
      this.meshes.get(elementId)!.count = 0;
    }
  }
}
