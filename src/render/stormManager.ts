import * as THREE from "three";

/**
 * The weather. Everything that makes a storm feel like one.
 *
 * WHY THIS EXISTS
 *
 * The game already had a storm in the simulation — a BFS wave with real
 * decay, real absorption, real per-tile damage — and almost nothing of it on
 * screen. A few white puffs drifted in, some tiles tinted, a ring expanded.
 * A player was told a storm had happened rather than shown one, which is a
 * problem for a game whose whole argument is that a surge is violent and
 * mangroves take the violence out of it. If the storm does not look
 * frightening, nothing the mangroves do looks like a rescue.
 *
 * So this layer drives five things off one number:
 *
 *   - **Rain.** Thousands of slanted streaks, falling harder as intensity
 *     rises, kept over the camera rather than over the map's origin.
 *   - **The sky.** The background darkens toward a bruised grey-green and
 *     the sun dims, so the whole board loses its holiday light.
 *   - **Lightning.** Brief, irregular, and only near the peak.
 *   - **Wind.** A scalar the element sway multiplies by, so mangroves and
 *     dune grass thrash instead of breathing.
 *   - **Shake.** A small camera tremor at the moment of impact.
 *
 * ONE DIAL, EASED
 *
 * Callers set a target intensity and this eases toward it. That matters for
 * honesty as much as for looks: the telegraph window sets a low value so the
 * weather visibly gathers over several turns, impact sets 1, and the
 * aftermath sets 0 so it clears slowly. A player learns to read the sky as a
 * countdown, which is the same information the HUD gives in numbers.
 *
 * REDUCED MOTION
 *
 * Shake and lightning are off entirely for a player who asked their system
 * for reduced motion — both are exactly the kind of sudden involuntary
 * movement that preference exists to prevent. Rain and the darkening stay,
 * at a gentler amplitude: they carry information about what the game is
 * doing, and removing them would leave such a player with no warning at all.
 */

/** How many rain streaks exist at full intensity, by quality. Drawn as one instanced call, so the cost is one draw. */
export type WeatherQuality = "low" | "medium" | "high";
const RAIN_DROPS: Record<WeatherQuality, number> = { low: 600, medium: 1400, high: 2400 };
/** The box rain falls inside, centred on the camera's focus. Wide enough to cover the board at any zoom. */
const RAIN_AREA = 46;
const RAIN_TOP = 16;
const RAIN_BOTTOM = -2;
/** Streak length. Longer streaks read as faster rain, which is cheaper than actually moving them faster. */
const RAIN_STREAK = 0.85;
const RAIN_FALL_SPEED = 26;
/** Horizontal drift per unit of fall, so rain slants rather than falling straight down. A vertical curtain reads as static. */
const RAIN_SLANT_X = 0.21;
const RAIN_SLANT_Z = 0.085;
/**
 * The most the storm darkens the board: the sun loses at most this share of
 * its light. Buildings, the heat and the HUD must stay readable in a storm.
 */
export const MAX_DARKNESS = 0.35;
/** The hard cap on any lightning flash (photosensitivity: low-contrast flashes only). */
export const MAX_FLASH_ALPHA = 0.25;
/**
 * What a flash actually lifts the sky and the sun by. Kept well under the
 * cap because it stacks with the on-screen overlay (also 0.15 at peak).
 */
const FLASH_LIFT = 0.15;
/** Shake only above this intensity. */
const SHAKE_FROM = 0.7;

const RAIN_VERTEX = /* glsl */ `
  attribute vec4 aDrop; // x, z offset in the volume; phase 0-1; speed factor
  uniform float uTime;
  uniform vec3 uCentre;
  uniform float uActive;
  varying float vAlpha;
  void main() {
    float height = ${(16 - -2).toFixed(1)};
    float fall = fract(aDrop.z - uTime * ${RAIN_FALL_SPEED.toFixed(1)} * aDrop.w / height);
    float y = ${(-2).toFixed(1)} + fall * height;
    float drop = (1.0 - fall) * height;
    // Drops past the active share sit below the floor: lighter rain is fewer drops, not fainter ones.
    float on = step(fract(aDrop.x * 12.9898 + aDrop.y * 78.233), uActive);
    vec3 p = vec3(uCentre.x + aDrop.x + drop * ${RAIN_SLANT_X.toFixed(3)}, y - (1.0 - on) * 40.0, uCentre.z + aDrop.y + drop * ${RAIN_SLANT_Z.toFixed(3)});
    // The streak: a thin quad, its top end trailing up and back along the slant.
    vec3 along = normalize(vec3(-${RAIN_SLANT_X.toFixed(3)}, 1.0, -${RAIN_SLANT_Z.toFixed(3)}));
    p += along * position.y * ${RAIN_STREAK.toFixed(2)};
    vec4 view = viewMatrix * vec4(p, 1.0);
    view.x += position.x * 0.018;
    vAlpha = 1.0 - position.y * 0.6;
    gl_Position = projectionMatrix * view;
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.81, 0.89, 0.94, uOpacity * vAlpha);
  }
`;

const STORM_SKY = new THREE.Color("#3f4a52");
const LIGHTNING_SKY = new THREE.Color("#c9d6dd");

/** Seconds for intensity to travel the full 0-to-1 range. Slow enough that weather reads as weather rather than a switch. */
const INTENSITY_RISE_SECONDS = 2.4;
const INTENSITY_FALL_SECONDS = 4.5;

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface StormManagerOptions {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
}

export class StormManager {
  readonly group = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly sun: THREE.DirectionalLight;
  private readonly baseSunIntensity: number;
  private readonly baseSky: THREE.Color;

  private rain: THREE.InstancedMesh;
  private readonly rainMaterial: THREE.ShaderMaterial;
  private quality: WeatherQuality = "high";

  private intensity = 0;
  private target = 0;
  private lastMs: number | null = null;

  /** Time remaining on the current lightning flash, in seconds. */
  private flashRemaining = 0;
  /** Countdown to the next strike, in seconds. */
  private nextStrikeIn = 0;

  private reducedMotion = prefersReducedMotion();
  /** Lightning on its own irregular timer (the Tutorial's weather). The Panaji storms strike from their script instead. */
  autoLightning = true;
  /** Set by a scripted storm: overrides the wind (for the lull before landfall) and the rain. */
  private windOverride: number | null = null;
  private rainOverride: number | null = null;
  private scriptedFlash = 0;
  /** Seconds since the last flash of either kind: flashes never come more than three a second. */
  private sinceFlash = 10;

  /** Current camera tremor, in world units. The session feeds this to the scene each frame. */
  shakeX = 0;
  shakeZ = 0;

  constructor(options: StormManagerOptions) {
    this.scene = options.scene;
    this.sun = options.sun;
    this.baseSunIntensity = options.sun.intensity;
    // Cloned: these are the values to return to, and the live scene objects
    // are mutated every frame below.
    this.baseSky = (options.scene.background as THREE.Color).clone();

    this.rainMaterial = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      transparent: true,
      depthWrite: false,
      // Rain in front of a dark sky should lighten it rather than paint over
      // it, and additive blending also means overlapping streaks build up
      // into the denser-looking core a real downpour has.
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCentre: { value: new THREE.Vector3() }, uActive: { value: 0 }, uOpacity: { value: 0 } }
    });
    this.rain = this.buildRain(RAIN_DROPS[this.quality]);
    this.group.add(this.rain);
  }

  /**
   * The curtain: one thin quad, instanced once per drop, falling in the
   * vertex shader from a time uniform. No per-frame work on the CPU, and one
   * draw call however many drops there are.
   */
  private buildRain(count: number): THREE.InstancedMesh {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    const drops = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      drops[i * 4] = (Math.random() - 0.5) * RAIN_AREA;
      drops[i * 4 + 1] = (Math.random() - 0.5) * RAIN_AREA;
      drops[i * 4 + 2] = Math.random();
      // Per-drop speed, so the curtain has depth instead of moving as one sheet.
      drops[i * 4 + 3] = 0.7 + Math.random() * 0.6;
    }
    quad.setAttribute("aDrop", new THREE.InstancedBufferAttribute(drops, 4));
    const mesh = new THREE.InstancedMesh(quad, this.rainMaterial, count);
    mesh.name = "storm-rain";
    // Positioned in the shader around the camera's focus: never cull it.
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 4;
    return mesh;
  }

  /** Low, Medium or High: how many drops fall. */
  setQuality(quality: WeatherQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.group.remove(this.rain);
    this.rain.geometry.dispose();
    this.rain = this.buildRain(RAIN_DROPS[quality]);
    this.group.add(this.rain);
  }

  /** Reduced motion (the OS setting or the in-game switch): no shake, no lightning, gentler rain. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  get isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  /** A scripted storm's wind (null hands it back to the intensity dial). */
  setWind(wind: number | null): void {
    this.windOverride = wind === null ? null : THREE.MathUtils.clamp(wind, 0, 1);
  }

  /** A scripted storm's rain, 0–1 (null hands it back to the intensity dial). */
  setRain(rain: number | null): void {
    this.rainOverride = rain === null ? null : THREE.MathUtils.clamp(rain, 0, 1);
  }

  /**
   * A lightning flash, from a storm's script. Ignored under reduced motion,
   * and when another flash came less than a third of a second ago.
   * Returns true if it flashed.
   */
  flash(): boolean {
    if (this.reducedMotion || this.sinceFlash < 0.34) return false;
    this.scriptedFlash = 0.12;
    this.sinceFlash = 0;
    return true;
  }

  /**
   * Where the weather should be heading.
   *
   * 0 is clear, 1 is the moment of impact. The telegraph window uses
   * something in between so the sky visibly gathers before anything lands —
   * the same warning the HUD countdown gives, in a form a player reads
   * without being told to.
   */
  setIntensity(target: number): void {
    this.target = THREE.MathUtils.clamp(target, 0, 1);
  }

  /** How hard the wind is blowing, for the element sway to multiply by. 0 when calm. */
  get windStrength(): number {
    return this.windOverride ?? this.intensity;
  }

  /** The current intensity (0–1), eased. */
  get level(): number {
    return this.intensity;
  }

  /**
   * Advances the weather. `focus` is where the camera is looking, so the rain
   * volume can follow it — a curtain anchored at the world origin would be
   * off screen the moment anyone panned.
   */
  tick(nowMs: number, focus: { x: number; z: number }): void {
    const deltaSeconds = Math.min(0.1, (nowMs - (this.lastMs ?? nowMs)) / 1000);
    this.lastMs = nowMs;

    this.advanceIntensity(deltaSeconds);
    this.sinceFlash += deltaSeconds;
    this.applySky(deltaSeconds);
    this.applyRain(nowMs, focus);
    this.applyShake();
  }

  private advanceIntensity(deltaSeconds: number): void {
    if (this.intensity === this.target) return;
    const seconds = this.target > this.intensity ? INTENSITY_RISE_SECONDS : INTENSITY_FALL_SECONDS;
    const step = deltaSeconds / seconds;
    this.intensity =
      this.target > this.intensity
        ? Math.min(this.target, this.intensity + step)
        : Math.max(this.target, this.intensity - step);
  }

  private applySky(deltaSeconds: number): void {
    // Lightning only near the peak, and never under reduced motion.
    let flash = 0;
    if (!this.reducedMotion && this.autoLightning && this.intensity > 0.55) {
      this.nextStrikeIn -= deltaSeconds;
      if (this.nextStrikeIn <= 0) {
        // Irregular on purpose. A strike on a fixed beat stops reading as
        // weather within about three repetitions.
        this.nextStrikeIn = 1.4 + Math.random() * 4.5;
        if (this.sinceFlash >= 0.34) {
          this.flashRemaining = 0.1 + Math.random() * 0.1;
          this.sinceFlash = 0;
        }
      }
    } else if (this.reducedMotion) {
      this.flashRemaining = 0;
      this.scriptedFlash = 0;
    }
    if (this.flashRemaining > 0) {
      this.flashRemaining -= deltaSeconds;
      flash = Math.max(0, this.flashRemaining) * 5;
    }
    if (this.scriptedFlash > 0) {
      this.scriptedFlash -= deltaSeconds;
      flash = Math.max(flash, Math.max(0, this.scriptedFlash) / 0.12);
    }
    flash = Math.min(1, flash);

    const background = this.scene.background as THREE.Color | null;
    if (background) {
      // At most about a 35% loss of light in the sky too (the storm grey is
      // nearly black next to the clear sky, so the lerp itself is capped).
      background.copy(this.baseSky).lerp(STORM_SKY, this.intensity * MAX_DARKNESS);
      if (flash > 0) background.lerp(LIGHTNING_SKY, flash * FLASH_LIFT);
    }

    // The sun loses at most MAX_DARKNESS of its light at full storm, and a
    // flash lifts it only modestly: a board the player cannot read is not
    // dramatic, it is broken.
    this.sun.intensity = this.baseSunIntensity * (1 - MAX_DARKNESS * this.intensity) * (1 + flash * FLASH_LIFT);
  }

  private applyRain(nowMs: number, focus: { x: number; z: number }): void {
    const amount = this.rainOverride ?? this.intensity;
    const visible = amount > 0.02;
    this.rain.visible = visible;
    if (!visible) return;
    const uniforms = this.rainMaterial.uniforms;
    // The curtain tracks the camera. Snapped to whole units so the drops do
    // not visibly slide sideways as the camera eases.
    uniforms.uCentre.value.set(Math.round(focus.x), 0, Math.round(focus.z));
    uniforms.uTime.value = nowMs / 1000;
    // Only a share of the drops fall at low intensity, so light rain is
    // genuinely lighter; reduced motion keeps fewer streaks.
    uniforms.uActive.value = (0.25 + amount * 0.75) * (this.reducedMotion ? 0.4 : 1);
    uniforms.uOpacity.value = 0.1 + amount * 0.45;
  }

  private applyShake(): void {
    if (this.reducedMotion || this.intensity < SHAKE_FROM) {
      this.shakeX = 0;
      this.shakeZ = 0;
      return;
    }
    // Only the top half of the intensity range shakes, and gently. A tremor
    // large enough to notice consciously makes the board hard to click, which
    // matters because the player is supposed to keep building during a storm.
    const amount = ((this.intensity - SHAKE_FROM) / (1 - SHAKE_FROM)) * 0.05;
    this.shakeX = (Math.random() - 0.5) * amount;
    this.shakeZ = (Math.random() - 0.5) * amount;
  }

  /** Puts the sky and sun back as they were. Called on teardown so a disposed session cannot leave the next one dark. */
  dispose(): void {
    const background = this.scene.background as THREE.Color | null;
    if (background) background.copy(this.baseSky);
    this.sun.intensity = this.baseSunIntensity;

    this.rain.geometry.dispose();
    this.rainMaterial.dispose();
  }
}
