/**
 * STEP_PROMPT_hazard_vfx_and_fluidity.md Section 1/4: one shared
 * sine-wave displacement function, reused everywhere low-poly water
 * surface motion is needed (the standing river surface and the hazard
 * wave-front's own geometry in `riverWaterManager.ts`/`waveFrontManager.ts`,
 * and — per Section 4's "water motion and element reactions should share
 * easing functions" — Khazan's ambient water-ripple idle motion in
 * `elementReactions.ts`) instead of each call site hand-rolling its own
 * sine math with slightly different constants.
 *
 * Three overlapping components at different wavelengths/directions/speeds
 * (never just one) is the actual technique, not a stylistic flourish — a
 * single sine wave reads as a uniform corrugated ripple, obviously
 * artificial; summing a few mismatched ones is the standard cheap
 * low-poly-water trick for breaking that uniformity up.
 */
import * as THREE from "three";

export interface WaveComponent {
  /** Peak height offset this component contributes, in world units. */
  amplitude: number;
  /** Distance between crests, in world units. */
  wavelength: number;
  /** How fast the crest travels along `dir`, in world units/second. */
  speed: number;
  /** Direction of travel in the XZ plane — need not be normalized, `waveHeight` normalizes it. */
  dir: { x: number; z: number };
}

/** A gentle, generic open-water idle ripple — three mismatched components, modest amplitude. */
export const IDLE_WATER_WAVES: WaveComponent[] = [
  { amplitude: 0.015, wavelength: 1.6, speed: 0.5, dir: { x: 1, z: 0.25 } },
  { amplitude: 0.009, wavelength: 0.9, speed: 0.8, dir: { x: -0.4, z: 1 } },
  { amplitude: 0.006, wavelength: 2.3, speed: 0.3, dir: { x: 0.6, z: -0.7 } }
];

/** The same shape, scaled up — a Flood telegraphing/resolving "turning the volume up" on the river's own standing water (Section 1). */
export const FLOOD_SURGE_WAVES: WaveComponent[] = [
  { amplitude: 0.07, wavelength: 1.4, speed: 1.3, dir: { x: 1, z: 0.25 } },
  { amplitude: 0.045, wavelength: 0.8, speed: 1.9, dir: { x: -0.4, z: 1 } },
  { amplitude: 0.03, wavelength: 2.0, speed: 0.9, dir: { x: 0.6, z: -0.7 } }
];

/**
 * Sums every component's contribution at world position (x,z) and time
 * `tSec` (seconds, not ms — keeps the per-wave `speed`/`wavelength` numbers
 * in a readable range). `phaseOffset` shifts the whole sum uniformly, used
 * by the hazard wave-front to tie a crest's radius to elapsed sweep time
 * rather than wall-clock time.
 */
export function waveHeight(x: number, z: number, tSec: number, waves: WaveComponent[], phaseOffset = 0): number {
  let h = 0;
  for (const w of waves) {
    const len = Math.hypot(w.dir.x, w.dir.z) || 1;
    const dx = w.dir.x / len;
    const dz = w.dir.z / len;
    const k = (2 * Math.PI) / w.wavelength;
    const phase = k * (dx * x + dz * z - w.speed * tSec) + phaseOffset;
    h += w.amplitude * Math.sin(phase);
  }
  return h;
}

/**
 * Scales every component's amplitude by `t` (0..1) — used to lerp a water
 * surface from idle to surge intensity (or anything in between) without
 * swapping wave arrays outright, which would pop rather than ramp.
 */
export function scaleWaves(waves: WaveComponent[], t: number): WaveComponent[] {
  return waves.map((w) => ({ ...w, amplitude: w.amplitude * t }));
}

/**
 * Recomputes vertex normals for a displaced BufferGeometry cheaply —
 * `computeVertexNormals()` is the correct call, named here so every
 * displacement call site uses the exact same post-step rather than some
 * forgetting it (a flat-shaded material still needs *some* normal data to
 * light consistently frame to frame as positions move).
 */
export function recomputeNormals(geometry: THREE.BufferGeometry): void {
  geometry.computeVertexNormals();
  geometry.attributes.position.needsUpdate = true;
  if (geometry.attributes.normal) geometry.attributes.normal.needsUpdate = true;
}
