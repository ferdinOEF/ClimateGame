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

/** How many rain streaks exist at full intensity. Drawn as one LineSegments call, so the cost is one draw. */
const RAIN_DROPS = 1400;
/** The box rain falls inside, centred on the camera's focus. Wide enough to cover the board at any zoom. */
const RAIN_AREA = 46;
const RAIN_TOP = 16;
const RAIN_BOTTOM = -2;
/** Streak length at full intensity. Longer streaks read as faster rain, which is cheaper than actually moving them faster. */
const RAIN_STREAK = 0.85;
const RAIN_FALL_SPEED = 26;
/** Horizontal drift, so rain slants rather than falling straight down. A vertical curtain reads as static. */
const RAIN_SLANT_X = 5.5;
const RAIN_SLANT_Z = 2.2;

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

  private readonly rain: THREE.LineSegments;
  private readonly rainMaterial: THREE.LineBasicMaterial;
  private readonly rainPositions: Float32Array;
  /** Per-drop fall speed multiplier, so the curtain has depth instead of moving as one sheet. */
  private readonly rainSpeeds: Float32Array;

  private intensity = 0;
  private target = 0;
  private lastMs: number | null = null;

  /** Time remaining on the current lightning flash, in seconds. */
  private flashRemaining = 0;
  /** Countdown to the next strike, in seconds. */
  private nextStrikeIn = 0;

  private readonly reducedMotion = prefersReducedMotion();

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

    // One LineSegments for the whole curtain. The obvious alternative, a mesh
    // per drop, is 1400 draw calls a frame; Points cannot be slanted, so a
    // drop would be a dot rather than a streak and the rain would read as
    // snow.
    const positions = new Float32Array(RAIN_DROPS * 2 * 3);
    const speeds = new Float32Array(RAIN_DROPS);
    for (let i = 0; i < RAIN_DROPS; i++) {
      speeds[i] = 0.7 + Math.random() * 0.6;
      this.seedDrop(positions, i, RAIN_BOTTOM + Math.random() * (RAIN_TOP - RAIN_BOTTOM));
    }
    this.rainPositions = positions;
    this.rainSpeeds = speeds;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // The curtain is repositioned onto the camera every frame, so a bounding
    // sphere computed once at the origin would frustum-cull it the moment the
    // player pans. Infinite radius costs nothing here and never culls wrongly.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color("#cfe4ef"),
      transparent: true,
      opacity: 0,
      // Rain in front of a dark sky should lighten it rather than paint over
      // it, and additive blending also means overlapping streaks build up
      // into the denser-looking core a real downpour has.
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.rain = new THREE.LineSegments(geometry, this.rainMaterial);
    this.rain.visible = false;
    this.rain.renderOrder = 2;
    this.group.add(this.rain);
  }

  /** Puts one drop at a random spot in the volume, at height `y`. */
  private seedDrop(positions: Float32Array, index: number, y: number): void {
    const x = (Math.random() - 0.5) * RAIN_AREA;
    const z = (Math.random() - 0.5) * RAIN_AREA;
    const head = index * 6;
    positions[head] = x;
    positions[head + 1] = y;
    positions[head + 2] = z;
    positions[head + 3] = x;
    positions[head + 4] = y + RAIN_STREAK;
    positions[head + 5] = z;
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
    this.applySky(deltaSeconds);
    this.applyRain(deltaSeconds, focus);
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
    if (!this.reducedMotion && this.intensity > 0.55) {
      this.nextStrikeIn -= deltaSeconds;
      if (this.nextStrikeIn <= 0) {
        // Irregular on purpose. A strike on a fixed beat stops reading as
        // weather within about three repetitions.
        this.nextStrikeIn = 1.4 + Math.random() * 4.5;
        this.flashRemaining = 0.1 + Math.random() * 0.1;
      }
      if (this.flashRemaining > 0) {
        this.flashRemaining -= deltaSeconds;
        flash = Math.max(0, this.flashRemaining) * 5;
      }
    } else {
      this.flashRemaining = 0;
    }

    const background = this.scene.background as THREE.Color | null;
    if (background) {
      background.copy(this.baseSky).lerp(STORM_SKY, this.intensity);
      if (flash > 0) background.lerp(LIGHTNING_SKY, Math.min(1, flash));
    }

    // The sun drops to just over a third at full storm, then spikes on a
    // flash. Keeping some light is deliberate: a board the player cannot read
    // is not dramatic, it is broken.
    this.sun.intensity = this.baseSunIntensity * (1 - 0.62 * this.intensity) + flash * 1.6;
  }

  private applyRain(deltaSeconds: number, focus: { x: number; z: number }): void {
    const visible = this.intensity > 0.02;
    this.rain.visible = visible;
    if (!visible) return;

    // The curtain tracks the camera. Snapped to whole units so the drops do
    // not visibly slide sideways as the camera eases — the volume moves, the
    // rain inside it does not.
    this.rain.position.set(Math.round(focus.x), 0, Math.round(focus.z));

    this.rainMaterial.opacity = 0.1 + this.intensity * 0.5;

    const positions = this.rainPositions;
    const fall = RAIN_FALL_SPEED * deltaSeconds * (0.45 + this.intensity * 0.55);
    const slantX = RAIN_SLANT_X * deltaSeconds * this.intensity;
    const slantZ = RAIN_SLANT_Z * deltaSeconds * this.intensity;
    // Only a share of the drops exist at low intensity, so light rain is
    // genuinely lighter rather than the same curtain faded out.
    const activeDrops = Math.max(1, Math.floor(RAIN_DROPS * (0.25 + this.intensity * 0.75)));

    for (let i = 0; i < activeDrops; i++) {
      const head = i * 6;
      const drop = fall * this.rainSpeeds[i];
      positions[head + 1] -= drop;
      positions[head + 4] -= drop;
      positions[head] += slantX;
      positions[head + 3] += slantX;
      positions[head + 2] += slantZ;
      positions[head + 5] += slantZ;

      if (positions[head + 1] < RAIN_BOTTOM) this.seedDrop(positions, i, RAIN_TOP);
    }

    // Drops past the active count are parked below the floor rather than
    // deleted: the buffer is a fixed size, and moving them is cheaper than
    // rebuilding the geometry every time intensity changes.
    for (let i = activeDrops; i < RAIN_DROPS; i++) {
      const head = i * 6;
      if (positions[head + 1] > RAIN_BOTTOM) {
        positions[head + 1] = RAIN_BOTTOM - 10;
        positions[head + 4] = RAIN_BOTTOM - 10;
      }
    }

    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  private applyShake(): void {
    if (this.reducedMotion || this.intensity < 0.5) {
      this.shakeX = 0;
      this.shakeZ = 0;
      return;
    }
    // Only the top half of the intensity range shakes, and gently. A tremor
    // large enough to notice consciously makes the board hard to click, which
    // matters because the player is supposed to keep building during a storm.
    const amount = (this.intensity - 0.5) * 2 * 0.055;
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
