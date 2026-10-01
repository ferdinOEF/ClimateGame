import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { createHexWaterGeometry } from "./hexGeometry";
import { paletteColor } from "./palette";
import { waveHeight, recomputeNormals, IDLE_WATER_WAVES, FLOOD_SURGE_WAVES, type WaveComponent } from "./waveMath";

const SEGMENTS_PER_EDGE = 4;
const SURFACE_CLEARANCE = 0.03;
/** How long a ramp from idle <-> surge intensity takes — a pop reads as a glitch, a ramp reads as "the river rising." */
const INTENSITY_RAMP_MS = 1800;

/**
 * STEP_PROMPT_hazard_vfx_and_fluidity.md Section 1: "give the river its own
 * standing/flowing water surface, not just a hazard-time overlay... that
 * intensifies in amplitude/speed when a Flood is telegraphing or
 * resolving." One merged, per-vertex-displaced mesh covering every River
 * tile, always present (unlike `HazardOverlayManager`'s per-tile reveal,
 * which only exists for ~2s around a hazard hit) — a slow idle ripple all
 * game, turned up to `FLOOD_SURGE_WAVES` while `setIntensity(1)` is active.
 *
 * Deliberately a separate mesh from `TerrainMeshManager`'s own River tile
 * tops (which stay exactly as they are — flat, vertex-colored, matching
 * every other terrain) — this floats a hair above them, the same layering
 * principle `HazardOverlayManager`/`WaveFrontManager` already use for their
 * own above-terrain effects.
 */
export class RiverWaterManager {
  readonly group = new THREE.Group();

  private mesh: THREE.Mesh | null = null;
  private baseY: Float32Array = new Float32Array(0);
  private startTimeMs = performance.now();

  private intensity = 0; // current, eased
  private targetIntensity = 0;
  private intensityChangedAtMs = performance.now();
  private intensityAtChangeStart = 0;

  private material: THREE.MeshStandardMaterial;

  constructor() {
    this.material = new THREE.MeshStandardMaterial({
      color: paletteColor("riverBlue").clone().lerp(new THREE.Color("#0d3752"), 0.25),
      transparent: true,
      opacity: 0.82,
      roughness: 0.35,
      metalness: 0.05,
      flatShading: true,
      side: THREE.DoubleSide
    });
  }

  /** (Re)builds the merged water surface for the given River tiles. Call once after the map loads. */
  setRiverTiles(coords: AxialCoord[], heightAt: (coord: AxialCoord) => number): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (coords.length === 0) return;

    const tileGeoms: THREE.BufferGeometry[] = [];
    const baseYValues: number[] = [];
    for (const coord of coords) {
      const geo = createHexWaterGeometry(0.95, SEGMENTS_PER_EDGE);
      const { x, z } = axialToWorld(coord, 1.0);
      const y = heightAt(coord) + SURFACE_CLEARANCE;
      geo.translate(x, y, z);
      tileGeoms.push(geo);
      const count = geo.attributes.position.count;
      for (let i = 0; i < count; i++) baseYValues.push(y);
    }

    const merged = mergeBufferGeometries(tileGeoms);
    for (const g of tileGeoms) g.dispose();
    this.baseY = new Float32Array(baseYValues);
    this.mesh = new THREE.Mesh(merged, this.material);
    this.mesh.frustumCulled = false; // one big merged mesh spanning the whole river — cheaper than a correct-but-constantly-recomputed bounding sphere on a surface whose vertices move every frame
    this.group.add(this.mesh);
  }

  /** Ramps toward 0 (idle ripple) or 1 (full `FLOOD_SURGE_WAVES` intensity) over `INTENSITY_RAMP_MS`. Safe to call every frame with the same value — only resets the ramp when the target actually changes. */
  setIntensity(target: number): void {
    if (target === this.targetIntensity) return;
    this.intensityAtChangeStart = this.currentIntensity();
    this.targetIntensity = target;
    this.intensityChangedAtMs = performance.now();
  }

  private currentIntensity(): number {
    const elapsed = performance.now() - this.intensityChangedAtMs;
    const t = THREE.MathUtils.clamp(elapsed / INTENSITY_RAMP_MS, 0, 1);
    return THREE.MathUtils.lerp(this.intensityAtChangeStart, this.targetIntensity, t);
  }

  tick(nowMs: number): void {
    if (!this.mesh) return;
    this.intensity = this.currentIntensity();
    const waves = lerpWaves(IDLE_WATER_WAVES, FLOOD_SURGE_WAVES, this.intensity);
    const tSec = (nowMs - this.startTimeMs) / 1000;

    const pos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.baseY[i] + waveHeight(x, z, tSec, waves));
    }
    recomputeNormals(this.mesh.geometry);
  }
}

/** Component-wise lerp between two same-shaped wave arrays — used to ramp idle<->surge smoothly rather than swapping the array outright. */
function lerpWaves(a: WaveComponent[], b: WaveComponent[], t: number): WaveComponent[] {
  return a.map((wa, i) => {
    const wb = b[i];
    return {
      amplitude: THREE.MathUtils.lerp(wa.amplitude, wb.amplitude, t),
      wavelength: THREE.MathUtils.lerp(wa.wavelength, wb.wavelength, t),
      speed: THREE.MathUtils.lerp(wa.speed, wb.speed, t),
      dir: wa.dir
    };
  });
}

/** Minimal position-only BufferGeometry merge (no normals/uvs needed — normals are recomputed every frame anyway) so this file doesn't need the full `BufferGeometryUtils.mergeGeometries` import just for one attribute. */
function mergeBufferGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  let indexOffset = 0;
  for (const geo of geoms) {
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    const idx = geo.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + indexOffset);
    indexOffset += posAttr.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}
