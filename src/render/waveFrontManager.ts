import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import type { HazardResult } from "@core/hazard";
import { paletteColor } from "./palette";

// STEP_PROMPT_hazard_science.md's own terrains: Coast + Estuary are the
// cyclone's BFS sources (round 0), and the wave spreads outward across
// Beach/Land as it moves inland over open ground. River tiles reached via
// the channel-funneling decay (STEP_PROMPT_ghats_wave_demo.md Section 0)
// are the separate "channel push" component, not open water.
const OPEN_WATER_TERRAINS = new Set(["coast", "beach", "land", "estuary"]);

const RING_SEGMENTS = 48;
const RING_BAND_WIDTH = 1.4; // how wide the visible "crest" band is, not a filling disc from the center
const RING_BASE_OPACITY = 0.8;
const CHANNEL_MARKER_RADIUS = 0.42;
const CHANNEL_FADE_IN_MS = 250;
const FADE_OUT_MS = 500; // both components fade out over this window at the very end of the sweep
const SURFACE_CLEARANCE = 0.06; // how far above the actual terrain top surface each component floats

interface RingCheckpoint {
  round: number;
  maxDist: number;
}

interface ChannelMarker {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  round: number;
}

/**
 * STEP_PROMPT_ghats_wave_demo.md Section 2/3 — the "demo": actual moving
 * water sweeping across the affected area in real time, layered on top of
 * (not replacing) `HazardOverlayManager`'s existing per-tile impact
 * reveals. Two components, both driven by the same real `arrivalRound`
 * data `applyHazardResult()`'s own per-tile stagger already uses, so this
 * stays honest to the real BFS resolution instead of becoming a
 * disconnected decoration (`hazard.ts`'s own comment on `arrivalRound`):
 *
 * - An expanding ring centered on the coastal origin — the open-water
 *   wave, covering every damaged Coast/Beach/Land/Estuary tile. Its outer
 *   radius grows between round-indexed checkpoints (each round's farthest
 *   affected tile from the origin), so it visibly reaches a given ring of
 *   tiles at roughly the same moment those tiles' own overlay pops.
 * - A row of small markers along the actual river-tile path the channel-
 *   funneled damage took, each fading in once the sweep's elapsed time
 *   passes that tile's own `arrivalRound` — narrower and a different hue
 *   than the open-water ring, reading as water pushing up a channel
 *   rather than a second copy of the same wave.
 *
 * Both components clean themselves up once `durationMs` (the caller's own
 * `sweepDurationMs(result)` — this class never recomputes that math)
 * elapses, so `main.ts` doesn't need a separate hide() call.
 */
export class WaveFrontManager {
  readonly group = new THREE.Group();

  private ringMaterial: THREE.MeshStandardMaterial;
  private ringMesh: THREE.Mesh | null = null;
  private ringOrigin = { x: 0, z: 0 };
  private ringY = SURFACE_CLEARANCE;
  private ringCheckpoints: RingCheckpoint[] = [];

  private channelMarkers: ChannelMarker[] = [];

  private startMs = 0;
  private durationMs = 0;
  private roundDurationMs = 550;
  private active = false;

  constructor() {
    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: paletteColor("waveFoam"),
      // Emissive, not just a lit surface color — a lit-only translucent
      // ring reads as barely-there against the scene's own ambient/
      // directional light (confirmed live: at the original 0.55 opacity
      // with no emissive term, the ring was nearly invisible against the
      // terrain), and this is meant to read as a spectacle, not a subtle
      // hint. Foam/surge water plausibly reads brighter than its
      // surroundings regardless of lighting angle, so emissive is also the
      // physically-reasonable choice here, not just a visibility hack.
      emissive: paletteColor("waveFoam"),
      emissiveIntensity: 0.6,
      flatShading: true,
      roughness: 0.5,
      transparent: true,
      opacity: RING_BASE_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  /**
   * Spawns both components for one hazard resolution. Safe to call while a
   * previous sweep's visuals are still fading — clears them first, same as
   * a real second event overtaking the first would look.
   */
  trigger(params: {
    result: HazardResult;
    originWorld: { x: number; z: number };
    terrainIdAt: (coord: AxialCoord) => string | undefined;
    /**
     * Real per-tile terrain top surface (`TerrainMeshManager.heightAt()`)
     * — terrain height varies by type (Coast/River sit at 0.3, Beach/Land
     * at 0.55), so a fixed world-space Y buries this layer inside the
     * terrain geometry wherever it's taller than that fixed value (found
     * live: at a flat y≈0.07, the ring/markers were rendering fully
     * occluded underneath the terrain's own top face everywhere except
     * past the map's edge, reading as "nothing visible" despite the scene
     * graph being entirely correct).
     */
    heightAt: (coord: AxialCoord) => number;
    hexSize: number;
    roundDurationMs: number;
    nowMs: number;
    durationMs: number;
  }): void {
    this.clear();
    const { result, originWorld, terrainIdAt, heightAt, hexSize, roundDurationMs, nowMs, durationMs } = params;
    this.ringOrigin = originWorld;
    this.roundDurationMs = roundDurationMs;
    this.startMs = nowMs;
    this.durationMs = durationMs;

    const maxDistByRound = new Map<number, number>();
    const channelTiles: { round: number; world: { x: number; z: number }; y: number }[] = [];
    let maxOpenWaterHeight = 0;

    for (const [key, damage] of result.tileDamage) {
      if (damage < 0.08) continue;
      const round = result.arrivalRound.get(key) ?? 0;
      const [q, r] = key.split(",").map(Number);
      const coord: AxialCoord = { q, r };
      const terrainId = terrainIdAt(coord);
      const world = axialToWorld(coord, hexSize);

      if (terrainId === "river") {
        channelTiles.push({ round, world, y: heightAt(coord) + SURFACE_CLEARANCE });
      } else if (terrainId && OPEN_WATER_TERRAINS.has(terrainId)) {
        const dist = Math.hypot(world.x - originWorld.x, world.z - originWorld.z);
        maxDistByRound.set(round, Math.max(maxDistByRound.get(round) ?? 0, dist));
        maxOpenWaterHeight = Math.max(maxOpenWaterHeight, heightAt(coord));
      }
    }
    // A single flat ring spans many tiles of different terrain heights
    // (Coast/Estuary vs. Beach/Land) — floats just above the tallest of
    // them, so it never sinks into the taller ones even if that means
    // riding slightly above the shorter ones. Still clearly "at the
    // surface," not buried.
    this.ringY = maxOpenWaterHeight + SURFACE_CLEARANCE;

    const rounds = [...maxDistByRound.keys()].sort((a, b) => a - b);
    this.ringCheckpoints = [{ round: -1, maxDist: 0 }];
    let cumulativeMax = 0;
    for (const round of rounds) {
      cumulativeMax = Math.max(cumulativeMax, maxDistByRound.get(round)!);
      this.ringCheckpoints.push({ round, maxDist: cumulativeMax });
    }

    channelTiles.sort((a, b) => a.round - b.round);
    for (const { round, world, y } of channelTiles) {
      const geometry = new THREE.CircleGeometry(CHANNEL_MARKER_RADIUS, 10);
      const material = new THREE.MeshStandardMaterial({
        color: paletteColor("channelPush"),
        emissive: paletteColor("channelPush"), // same visibility reasoning as the ring's own material, above
        emissiveIntensity: 0.6,
        flatShading: true,
        roughness: 0.5,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(world.x, y, world.z);
      this.group.add(mesh);
      this.channelMarkers.push({ mesh, material, round });
    }

    this.active = rounds.length > 0 || channelTiles.length > 0;
    if (rounds.length > 0) this.rebuildRing(0);
  }

  private rebuildRing(outerRadius: number): void {
    if (this.ringMesh) {
      this.group.remove(this.ringMesh);
      this.ringMesh.geometry.dispose();
      this.ringMesh = null;
    }
    if (outerRadius <= 0.01) return;
    const inner = Math.max(0, outerRadius - RING_BAND_WIDTH);
    const geometry = new THREE.RingGeometry(inner, outerRadius, RING_SEGMENTS);
    const mesh = new THREE.Mesh(geometry, this.ringMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.ringOrigin.x, this.ringY, this.ringOrigin.z);
    this.group.add(mesh);
    this.ringMesh = mesh;
  }

  private radiusAtRound(currentRound: number): number {
    let lower = this.ringCheckpoints[0];
    let upper = this.ringCheckpoints[this.ringCheckpoints.length - 1];
    for (let i = 0; i < this.ringCheckpoints.length - 1; i++) {
      if (currentRound >= this.ringCheckpoints[i].round && currentRound <= this.ringCheckpoints[i + 1].round) {
        lower = this.ringCheckpoints[i];
        upper = this.ringCheckpoints[i + 1];
        break;
      }
    }
    if (upper.round === lower.round) return upper.maxDist;
    const frac = THREE.MathUtils.clamp((currentRound - lower.round) / (upper.round - lower.round), 0, 1);
    return THREE.MathUtils.lerp(lower.maxDist, upper.maxDist, frac);
  }

  /** Call once per rendered frame — a no-op whenever nothing is currently sweeping. */
  tick(nowMs: number): void {
    if (!this.active) return;
    const elapsed = nowMs - this.startMs;
    if (elapsed >= this.durationMs) {
      this.clear();
      return;
    }
    const fadeOutFrac = elapsed > this.durationMs - FADE_OUT_MS ? 1 - (elapsed - (this.durationMs - FADE_OUT_MS)) / FADE_OUT_MS : 1;

    if (this.ringCheckpoints.length > 1) {
      const currentRound = elapsed / this.roundDurationMs;
      this.rebuildRing(this.radiusAtRound(currentRound));
      this.ringMaterial.opacity = RING_BASE_OPACITY * THREE.MathUtils.clamp(fadeOutFrac, 0, 1);
    }

    for (const marker of this.channelMarkers) {
      const revealAtMs = marker.round * this.roundDurationMs;
      const fadeIn = elapsed >= revealAtMs ? THREE.MathUtils.clamp((elapsed - revealAtMs) / CHANNEL_FADE_IN_MS, 0, 1) : 0;
      marker.material.opacity = 0.85 * fadeIn * THREE.MathUtils.clamp(fadeOutFrac, 0, 1);
    }
  }

  private clear(): void {
    if (this.ringMesh) {
      this.group.remove(this.ringMesh);
      this.ringMesh.geometry.dispose();
      this.ringMesh = null;
    }
    for (const marker of this.channelMarkers) {
      this.group.remove(marker.mesh);
      marker.mesh.geometry.dispose();
      marker.material.dispose();
    }
    this.channelMarkers = [];
    this.ringCheckpoints = [];
    this.active = false;
  }
}
