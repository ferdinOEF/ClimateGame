import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import type { HazardResult } from "@core/hazard";
import { paletteColor } from "./palette";
import { waveHeight, scaleWaves, type WaveComponent } from "./waveMath";

// STEP_PROMPT_hazard_science.md's own terrains: Coast + Estuary are the
// cyclone's BFS sources (round 0), and the wave spreads outward across
// Beach/Land as it moves inland over open ground. River tiles reached via
// the channel-funneling decay (STEP_PROMPT_ghats_wave_demo.md Section 0)
// are the separate "channel push" component, not open water.
const OPEN_WATER_TERRAINS = new Set(["coast", "beach", "land", "estuary"]);

const RING_RADIAL_SEGMENTS = 6; // steps across the band's own width — enough for the leading-edge crest to taper, not so many it's an expensive rebuild every frame
const RING_ANGULAR_SEGMENTS = 64;
const RING_BAND_WIDTH = 1.4; // how wide the visible "crest" band is, not a filling disc from the center
const RING_BASE_OPACITY = 0.8;
const CHANNEL_MARKER_RADIUS = 0.42;
const CHANNEL_FADE_IN_MS = 250;
const FADE_OUT_MS = 500; // both components fade out over this window at the very end of the sweep
const SURFACE_CLEARANCE = 0.06; // how far above the actual terrain top surface each component floats
/** STEP_PROMPT_hazard_vfx_and_fluidity.md Section 1: the band's own geometry crests toward its outer (leading) edge, reading as a wave actually arriving rather than a flat disc fading in. */
const CREST_HEIGHT = 0.22;
/** Section 1's compound-confluence ask: amplitude/crest multiplier when this sweep is concurrently overlapping the other hazard's — "visibly choppier, taller... clamped," same spirit as the damage-side `COMPOUND_OVERLAY_COLOR` sum-and-cap. */
const COMPOUND_MULTIPLIER = 1.7;
const COMPOUND_COLOR = new THREE.Color("#c9503a"); // matches HazardOverlayManager's own COMPOUND_OVERLAY_COLOR — same "this spot is compound" visual language

const RING_WAVES: WaveComponent[] = [
  { amplitude: 0.05, wavelength: 1.1, speed: 1.1, dir: { x: 1, z: 0.3 } },
  { amplitude: 0.03, wavelength: 0.6, speed: 1.6, dir: { x: -0.5, z: 0.9 } }
];

interface RingCheckpoint {
  round: number;
  maxDist: number;
}

interface ChannelMarker {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  round: number;
  baseGeometry: THREE.BufferGeometry;
  baseY: number;
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
 * STEP_PROMPT_hazard_vfx_and_fluidity.md Section 1: both components are now
 * real displaced geometry (`waveMath.ts`'s shared sine-sum, same utility
 * `riverWaterManager.ts` uses) rather than a flat tinted plane — the ring's
 * own band is rebuilt every tick with per-vertex height so it reads as a
 * crest sweeping outward and cresting toward its own leading edge, and each
 * channel marker ripples the same way at its own tile. A `compound` flag on
 * `trigger()` boosts both components' amplitude/color when this sweep is
 * known (by the caller) to be overlapping the other hazard's.
 *
 * Both components clean themselves up once `durationMs` (the caller's own
 * `sweepDurationMs(result)` — this class never recomputes that math)
 * elapses, so `main.ts` doesn't need a separate hide() call.
 */
export class WaveFrontManager {
  readonly group = new THREE.Group();

  private ringMaterial: THREE.MeshStandardMaterial;
  private foamMaterial: THREE.MeshStandardMaterial;
  private ringMesh: THREE.Mesh | null = null;
  private foamMesh: THREE.Mesh | null = null;
  private ringOrigin = { x: 0, z: 0 };
  private ringY = SURFACE_CLEARANCE;
  private ringCheckpoints: RingCheckpoint[] = [];

  private channelMarkers: ChannelMarker[] = [];

  private startMs = 0;
  private durationMs = 0;
  private roundDurationMs = 550;
  private active = false;
  private compound = false;

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
    // STEP_PROMPT_hazard_vfx_and_fluidity.md Section 1's "foam/whitewater
    // accent at the propagation front" — a thin, brighter strip riding
    // exactly at the ring's own current outer radius, separate from the
    // band so it reads as a distinct leading edge rather than just "the
    // ring's far pixel row."
    this.foamMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffffff"),
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0.9,
      flatShading: true,
      roughness: 0.4,
      transparent: true,
      opacity: 0.95,
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
    /** STEP_PROMPT_hazard_vfx_and_fluidity.md Section 1: true when the caller (`main.ts`, via the same `stormSurgeActive`/flood-concurrency check already used for the damage-side compound logic) knows this sweep overlaps the other hazard's. */
    compound?: boolean;
  }): void {
    this.clear();
    const { result, originWorld, terrainIdAt, heightAt, hexSize, roundDurationMs, nowMs, durationMs, compound } = params;
    this.ringOrigin = originWorld;
    this.roundDurationMs = roundDurationMs;
    this.startMs = nowMs;
    this.durationMs = durationMs;
    this.compound = compound ?? false;

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
      const baseGeometry = createRippleDiscGeometry(CHANNEL_MARKER_RADIUS, 3, 14);
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
      const mesh = new THREE.Mesh(baseGeometry.clone(), material);
      mesh.position.set(world.x, y, world.z);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.channelMarkers.push({ mesh, material, round, baseGeometry, baseY: y });
    }

    this.active = rounds.length > 0 || channelTiles.length > 0;
    if (rounds.length > 0) this.rebuildRing(0, nowMs);
  }

  private rebuildRing(outerRadius: number, nowMs: number): void {
    if (this.ringMesh) {
      this.group.remove(this.ringMesh);
      this.ringMesh.geometry.dispose();
      this.ringMesh = null;
    }
    if (this.foamMesh) {
      this.group.remove(this.foamMesh);
      this.foamMesh.geometry.dispose();
      this.foamMesh = null;
    }
    if (outerRadius <= 0.01) return;
    const inner = Math.max(0, outerRadius - RING_BAND_WIDTH);
    const tSec = (nowMs - this.startMs) / 1000;
    const waves = this.compound ? scaleWaves(RING_WAVES, COMPOUND_MULTIPLIER) : RING_WAVES;
    const crestHeight = CREST_HEIGHT * (this.compound ? COMPOUND_MULTIPLIER : 1);

    const geometry = buildCrestingRingGeometry({
      origin: this.ringOrigin,
      innerRadius: inner,
      outerRadius,
      y: this.ringY,
      radialSegments: RING_RADIAL_SEGMENTS,
      angularSegments: RING_ANGULAR_SEGMENTS,
      crestHeight,
      waves,
      tSec
    });
    const mesh = new THREE.Mesh(geometry, this.compound ? this.ringMaterial.clone() : this.ringMaterial);
    if (this.compound && mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.color = COMPOUND_COLOR.clone();
      mesh.material.emissive = COMPOUND_COLOR.clone();
    }
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.ringMesh = mesh;

    // The foam leading edge — a thin strip riding exactly at outerRadius,
    // raised to the crest's own peak height so it visibly caps the wave
    // rather than floating inside it.
    const foamGeometry = buildRingStripGeometry(this.ringOrigin, outerRadius, this.ringY + crestHeight, RING_ANGULAR_SEGMENTS);
    const foamMesh = new THREE.Mesh(foamGeometry, this.foamMaterial);
    foamMesh.frustumCulled = false;
    this.group.add(foamMesh);
    this.foamMesh = foamMesh;
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
      this.rebuildRing(this.radiusAtRound(currentRound), nowMs);
      const opacity = RING_BASE_OPACITY * THREE.MathUtils.clamp(fadeOutFrac, 0, 1);
      if (this.ringMesh && this.ringMesh.material instanceof THREE.MeshStandardMaterial) this.ringMesh.material.opacity = opacity;
      if (this.foamMesh && this.foamMesh.material instanceof THREE.MeshStandardMaterial) {
        this.foamMesh.material.opacity = 0.95 * THREE.MathUtils.clamp(fadeOutFrac, 0, 1);
      }
    }

    const tSec = (nowMs - this.startMs) / 1000;
    const waves = this.compound ? scaleWaves(RING_WAVES, COMPOUND_MULTIPLIER) : RING_WAVES;
    for (const marker of this.channelMarkers) {
      const revealAtMs = marker.round * this.roundDurationMs;
      const fadeIn = elapsed >= revealAtMs ? THREE.MathUtils.clamp((elapsed - revealAtMs) / CHANNEL_FADE_IN_MS, 0, 1) : 0;
      marker.material.opacity = (this.compound ? 0.95 : 0.85) * fadeIn * THREE.MathUtils.clamp(fadeOutFrac, 0, 1);
      if (this.compound) marker.material.color = COMPOUND_COLOR;
      displaceRippleDisc(marker.mesh.geometry as THREE.BufferGeometry, marker.baseGeometry, marker.baseY, tSec, waves);
    }
  }

  private clear(): void {
    if (this.ringMesh) {
      this.group.remove(this.ringMesh);
      this.ringMesh.geometry.dispose();
      this.ringMesh = null;
    }
    if (this.foamMesh) {
      this.group.remove(this.foamMesh);
      this.foamMesh.geometry.dispose();
      this.foamMesh = null;
    }
    for (const marker of this.channelMarkers) {
      this.group.remove(marker.mesh);
      marker.mesh.geometry.dispose();
      marker.baseGeometry.dispose();
      marker.material.dispose();
    }
    this.channelMarkers = [];
    this.ringCheckpoints = [];
    this.active = false;
  }
}

/**
 * The open-water band: a radial x angular grid between innerRadius and
 * outerRadius, Y-displaced by `waveHeight` plus a crest that ramps toward
 * the outer (leading) edge — `radialT^3` so the bump is concentrated right
 * at the front rather than a linear ramp across the whole band.
 */
function buildCrestingRingGeometry(params: {
  origin: { x: number; z: number };
  innerRadius: number;
  outerRadius: number;
  y: number;
  radialSegments: number;
  angularSegments: number;
  crestHeight: number;
  waves: WaveComponent[];
  tSec: number;
}): THREE.BufferGeometry {
  const { origin, innerRadius, outerRadius, y, radialSegments, angularSegments, crestHeight, waves, tSec } = params;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= radialSegments; ring++) {
    const radialT = ring / radialSegments;
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, radialT);
    const crest = crestHeight * Math.pow(radialT, 3);
    for (let a = 0; a <= angularSegments; a++) {
      const angle = (a / angularSegments) * Math.PI * 2;
      const x = origin.x + radius * Math.sin(angle);
      const z = origin.z + radius * Math.cos(angle);
      const h = y + crest + waveHeight(x, z, tSec, waves);
      positions.push(x, h, z);
    }
  }
  const rowLen = angularSegments + 1;
  for (let ring = 0; ring < radialSegments; ring++) {
    for (let a = 0; a < angularSegments; a++) {
      const a0 = ring * rowLen + a;
      const a1 = a0 + 1;
      const b0 = a0 + rowLen;
      const b1 = a1 + rowLen;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The thin, undisplaced foam strip sitting exactly at the current outer radius — the leading edge "cap." */
function buildRingStripGeometry(origin: { x: number; z: number }, radius: number, y: number, angularSegments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const innerRadius = Math.max(0, radius - 0.18);
  for (const r of [innerRadius, radius]) {
    for (let a = 0; a <= angularSegments; a++) {
      const angle = (a / angularSegments) * Math.PI * 2;
      positions.push(origin.x + r * Math.sin(angle), y, origin.z + r * Math.cos(angle));
    }
  }
  const rowLen = angularSegments + 1;
  for (let a = 0; a < angularSegments; a++) {
    const a0 = a;
    const a1 = a + 1;
    const b0 = a0 + rowLen;
    const b1 = a1 + rowLen;
    indices.push(a0, b0, a1, a1, b0, b1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A small flat disc (center + `rings` concentric rows) local to its own origin — enough resolution for a visible ripple once displaced. */
function createRippleDiscGeometry(radius: number, rings: number, angularSegments: number): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (let ring = 1; ring <= rings; ring++) {
    const r = (ring / rings) * radius;
    for (let a = 0; a < angularSegments; a++) {
      const angle = (a / angularSegments) * Math.PI * 2;
      positions.push(r * Math.sin(angle), 0, r * Math.cos(angle));
    }
  }
  // Center fan to the first ring.
  const firstRingStart = 1;
  for (let a = 0; a < angularSegments; a++) {
    const next = (a + 1) % angularSegments;
    indices.push(0, firstRingStart + a, firstRingStart + next);
  }
  for (let ring = 1; ring < rings; ring++) {
    const start = 1 + (ring - 1) * angularSegments;
    const nextStart = 1 + ring * angularSegments;
    for (let a = 0; a < angularSegments; a++) {
      const next = (a + 1) % angularSegments;
      const a0 = start + a;
      const a1 = start + next;
      const b0 = nextStart + a;
      const b1 = nextStart + next;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Re-displaces a ripple disc's live geometry from its own undisplaced base geometry each tick — avoids compounding displacement onto an already-displaced buffer frame over frame. */
function displaceRippleDisc(live: THREE.BufferGeometry, base: THREE.BufferGeometry, baseY: number, tSec: number, waves: WaveComponent[]): void {
  const livePos = live.attributes.position;
  const basePos = base.attributes.position;
  for (let i = 0; i < livePos.count; i++) {
    const x = basePos.getX(i);
    const z = basePos.getZ(i);
    const r = Math.hypot(x, z);
    // A small outward-rippling pattern local to the marker's own center (distance-from-center as the wave's traveling coordinate), not the shared directional waveHeight — this is a landing ripple, not open water.
    const ripple = 0.03 * Math.sin(r * 9 - tSec * 5) * Math.max(0, 1 - r / CHANNEL_MARKER_RADIUS);
    livePos.setY(i, baseY + ripple + waveHeight(x, z, tSec, waves) * 0.3);
  }
  livePos.needsUpdate = true;
  live.computeVertexNormals();
}
