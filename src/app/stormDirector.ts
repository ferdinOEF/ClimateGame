import * as THREE from "three";
import { axialToWorld, axialKey, neighbor, type AxialCoord } from "@core/hex";
import { STORM_TIMING, combinedDepth, type DepthField } from "@core/hazard";
import { FRONTS, type ZoneIndex } from "@core/zones";
import { buildStormScript, type StormEvent, type StormScript } from "@core/stormScript";
import { defendsAgainst, type StormRecord } from "@core/stormRecord";
import type { StormWater, WaterTile } from "@render/storm/stormWater";
import type { StormSky } from "@render/storm/stormSky";
import type { StormManager } from "@render/stormManager";

/**
 * Plays a recorded storm: one clock (storm time, in seconds) drives the
 * water, the clouds, the rain and wind, the camera and every moment the
 * storm's script marks (core/stormScript.ts). Nothing here decides anything:
 * the houses that go and the defences that hold are the resolver's, at the
 * times the depth field puts them.
 *
 * The clock runs at 1x, at 0.4x for about a second and a half when the water
 * first reaches a defence (the slow-motion beat), and at 4x while the player
 * hurries it (a click). Reduced motion skips the slow motion and the shake.
 */
export interface StormDirectorDeps {
  tiles: { coord: AxialCoord; terrainId: string }[];
  heightAt: (coord: AxialCoord) => number;
  zones: ZoneIndex;
  water: StormWater;
  sky: StormSky;
  weather: StormManager;
  /** What stands on a tile now (element id). */
  elementAt: (key: string) => string | undefined;
  /** Degrade amount of what stands on a tile now (0 if nothing). */
  degradeAt: (key: string) => number;
  focusOn: (x: number, z: number) => void;
  fitTo: (width: number, depth: number) => void;
  setTint: (coord: AxialCoord, tint: THREE.Color | null, blend?: number) => void;
  houseLost: (coord: AxialCoord) => void;
  defenceFailed: (coord: AxialCoord) => void;
  defenceWorn: (coord: AxialCoord, degrade: number) => void;
  /** The ring and the creatures: a defence answering. */
  defenceAnswers: (coord: AxialCoord, elementId: string) => void;
  /** A short word over a tile ("Absorbed", "Overwhelmed", "Failed"). */
  label: (coord: AxialCoord, text: string, tone: "good" | "warn" | "bad") => void;
  /** A capped, rate-limited lightning flash on screen (alpha ≤ 0.25). */
  screenFlash: () => void;
  reducedMotion: () => boolean;
  /** Sound cues (P7). */
  sound?: (cue: StormCue, value?: number) => void;
}

export type StormCue = "begin" | "landfall" | "thunder" | "absorbed" | "overwhelmed" | "failed" | "house" | "calm" | "end" | "levels";

export interface StormPlayHooks {
  onHouseLost: () => void;
  /** True while the player is hurrying the storm along. */
  hurry: () => boolean;
  /** The storm moves into a new phase; `line` is what Maya says about it. */
  onPhase?: (phase: string, line: string) => void;
}

const SLOW_SCALE = 0.4;
const SLOW_SECONDS = 1.5;
const HURRY_SCALE = 4;
const WET_SAND = new THREE.Color("#c9b98f");
const SEA = "coast";

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

function centroid(coords: AxialCoord[]): THREE.Vector2 {
  const v = new THREE.Vector2();
  for (const c of coords) {
    const w = axialToWorld(c, 1.0);
    v.x += w.x;
    v.y += w.z;
  }
  return coords.length > 0 ? v.divideScalar(coords.length) : v;
}

export class StormDirector {
  private record: StormRecord | null = null;
  private script: StormScript | null = null;
  private field: DepthField | null = null;
  private hooks: StormPlayHooks | null = null;
  private resolve: (() => void) | null = null;
  private t = 0;
  private nextEvent = 0;
  private lastMs: number | null = null;
  private slowUntilMs = 0;
  private frozenAt: number | null = null;
  private readonly pulses = new Map<string, number>();
  /** Defences the water has reached: their ring pulses while the water is on them. */
  private readonly contacted = new Set<string>();
  private phases: { t: number; name: string; line: string }[] = [];
  private nextPhase = 0;
  private readonly fills = new Map<string, number>();
  private khazans: string[] = [];
  private shoreSea: AxialCoord[] = [];
  private landfall = new THREE.Vector2();
  private seaward = new THREE.Vector2(-1, 0);
  private upstream = new THREE.Vector2();
  private channelMid = new THREE.Vector2();
  private readonly windDir = new THREE.Vector2(1, 0);
  private labelled = 0;

  constructor(private readonly deps: StormDirectorDeps) {}

  get playing(): boolean {
    return this.record !== null;
  }

  /** Storm time now, seconds. */
  get time(): number {
    return this.t;
  }

  get currentField(): DepthField | null {
    return this.field;
  }

  get currentScript(): StormScript | null {
    return this.script;
  }

  /** For the screenshots and checks: hold the storm at `seconds` (null lets it run). */
  freezeAt(seconds: number | null): void {
    this.frozenAt = seconds;
  }

  /**
   * Plays `record`. `defences` names what stood on each tile before the
   * storm (key → element id), since a structure that failed is already gone
   * from the board. Resolves once the water has drained.
   */
  play(record: StormRecord, defences: ReadonlyMap<string, string>, hooks: StormPlayHooks): Promise<void> {
    this.finish();
    this.record = record;
    this.field = record.field;
    this.script = buildStormScript(record, defences);
    this.hooks = hooks;
    this.t = 0;
    this.nextEvent = 0;
    this.lastMs = null;
    this.slowUntilMs = 0;
    this.labelled = 0;
    this.pulses.clear();
    this.contacted.clear();
    this.phases = this.phasesFor(record, defences);
    this.nextPhase = 0;
    this.fills.clear();
    this.layoutPaths(record);
    const tiles: WaterTile[] = this.deps.tiles.map(({ coord, terrainId }) => ({ key: axialKey(coord), q: coord.q, r: coord.r, terrainId, top: this.deps.heightAt(coord) }));
    this.khazans = [...defences].filter(([, id]) => id === "khazan").map(([key]) => key);
    const hazards = record.kind === "compound" ? (["cyclone", "flood"] as const) : ([record.kind] as const);
    this.deps.water.begin(
      record.field,
      tiles,
      (key) => defences.get(key) ?? this.deps.elementAt(key),
      (key) => {
        const id = defences.get(key);
        return id !== undefined && defendsAgainst(id, hazards);
      }
    );
    this.frameCamera();
    this.deps.weather.autoLightning = false;
    this.deps.sound?.("begin");
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  /**
   * The storm's phases and Maya's line for each, after the prototype's
   * script. Generic on purpose: no named storm, no date, no figure. The
   * khazan line is said only where khazans stand.
   */
  private phasesFor(record: StormRecord, defences: ReadonlyMap<string, string>): { t: number; name: string; line: string }[] {
    const field = record.field;
    const landfall = field.landfall ?? STORM_TIMING.cyclone.landfall;
    const hasKhazans = [...defences.values()].includes("khazan");
    const hasMangroves = [...defences.values()].includes("mangrove");
    if (record.kind === "cyclone") {
      return [
        { t: 4, name: "Approach", line: "A cyclone is forming offshore. The waves are getting bigger." },
        { t: landfall, name: "Landfall", line: "Landfall! Watch the surge climb the beach." },
        { t: landfall + 8, name: "Recede", line: hasMangroves ? "The water is draining. Count the homes your mangroves kept dry." : "The water is draining. Count the homes that stayed dry." }
      ];
    }
    if (record.kind === "flood") {
      return [
        { t: 4, name: "Rain builds", line: "Heavy rain upstream. The river will rise soon." },
        { t: STORM_TIMING.flood.rainLead, name: "River swells", line: hasKhazans ? "The swell is moving downriver and spilling over the low banks. The khazans are holding water." : "The swell is moving downriver and spilling over the low, unprotected banks." },
        { t: field.duration - 12, name: "Recede", line: "The river is falling." }
      ];
    }
    return [
      { t: 4, name: "Storm and rain", line: "The storm is closing in and the rain has started upstream. Two fronts at once." },
      { t: landfall + 2, name: "Pincer", line: "The sea surge is pushing against the swollen river. The water cannot drain, so the river mouth backs up!" },
      { t: field.duration - 11, name: "Recede", line: "Both fronts are easing. Count the homes your defences held." }
    ];
  }

  /** Where the storm comes from and goes: landfall, the sea's direction, the channel's ends. */
  private layoutPaths(record: StormRecord): void {
    const zones = this.deps.zones;
    const terrain = new Map(this.deps.tiles.map((t) => [axialKey(t.coord), t.terrainId]));
    const cycloneFront = FRONTS[record.kind].find((front) => front.hazard === "cyclone");
    if (cycloneFront) {
      const zoneKeys = zones.keys(cycloneFront.path[0]);
      const shore: AxialCoord[] = [];
      const sea: AxialCoord[] = [];
      for (const key of zoneKeys) {
        const [q, r] = key.split(",").map(Number);
        if (terrain.get(key) === SEA) continue;
        for (let dir = 0; dir < 6; dir++) {
          const n = neighbor({ q, r }, dir);
          if (terrain.get(axialKey(n)) === SEA) {
            shore.push({ q, r });
            sea.push(n);
          }
        }
      }
      const land = centroid(shore.length > 0 ? shore : zoneKeys.map((k) => ({ q: Number(k.split(",")[0]), r: Number(k.split(",")[1]) })));
      const water = centroid(sea);
      this.landfall.copy(land);
      this.seaward.copy(sea.length > 0 ? water.clone().sub(land) : new THREE.Vector2(-1, 0.3));
      if (this.seaward.lengthSq() < 1e-6) this.seaward.set(-1, 0.3);
      this.seaward.normalize();
      this.windDir.copy(this.seaward).multiplyScalar(-1);
      // The shallows that drain before the hit: sea tiles beside the coast near landfall.
      this.shoreSea = [];
      const seen = new Set<string>();
      for (const coord of sea) {
        const key = axialKey(coord);
        if (seen.has(key)) continue;
        seen.add(key);
        const w = axialToWorld(coord, 1.0);
        if (Math.hypot(w.x - land.x, w.z - land.y) < 9) this.shoreSea.push(coord);
      }
    }
    // The channel: its upstream end and its middle, for the rain band.
    const channel = [...record.field.tiles.values()].filter((tile) => tile.terrainId === "river" && tile.riverIndex !== null);
    if (channel.length > 0) {
      const toCoord = (key: string): AxialCoord => ({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) });
      const minIndex = Math.min(...channel.map((t) => t.riverIndex!));
      this.upstream.copy(centroid(channel.filter((t) => t.riverIndex! <= minIndex + 2).map((t) => toCoord(t.key))));
      this.channelMid.copy(centroid(channel.map((t) => toCoord(t.key))));
    }
  }

  private frameCamera(): void {
    const kind = this.record?.kind;
    if (kind === "flood") {
      this.deps.focusOn(this.channelMid.x, this.channelMid.y);
      this.deps.fitTo(34, 22);
    } else {
      const at = this.landfall.clone().addScaledVector(this.seaward, kind === "compound" ? 1.5 : 3);
      this.deps.focusOn(at.x, at.y);
      this.deps.fitTo(kind === "compound" ? 34 : 30, kind === "compound" ? 22 : 20);
    }
  }

  /** Called every frame. */
  tick(nowMs: number): void {
    if (!this.record || !this.field || !this.script || !this.hooks) return;
    const dt = this.lastMs === null ? 0 : Math.min(0.1, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    const reduced = this.deps.reducedMotion();
    let scale = 1;
    if (nowMs < this.slowUntilMs && !reduced) scale = SLOW_SCALE;
    if (this.hooks.hurry()) scale = HURRY_SCALE;
    if (this.frozenAt !== null) {
      this.t = this.frozenAt;
    } else {
      this.t += dt * scale;
    }
    const t = this.t;

    // The script's moments, in order.
    const events = this.script.events;
    while (this.nextEvent < events.length && events[this.nextEvent].t <= t) this.fire(events[this.nextEvent++], nowMs, reduced);

    // Pulses fade.
    // A defence the water has reached pulses while the water is on it (a
    // steady glow under reduced motion), and fades once it has drained.
    for (const key of this.contacted) {
      const wet = this.nearbyDepth(key, t) > 0.05;
      const beat = reduced ? 0.55 : 0.35 + 0.65 * Math.abs(Math.sin(t * 4));
      const was = this.pulses.get(key) ?? 0;
      this.pulses.set(key, wet ? Math.max(beat, was - dt * 2) : Math.max(0, was - dt * 0.8));
    }
    while (this.nextPhase < this.phases.length && this.phases[this.nextPhase].t <= t) {
      const phase = this.phases[this.nextPhase++];
      if (!this.hooks.hurry()) this.hooks.onPhase?.(phase.name, phase.line);
    }
    // Khazans fill as the flood reaches them, and hold it.
    for (const key of this.khazans) {
      const near = this.nearbyDepth(key, t);
      this.fills.set(key, Math.max(this.fills.get(key) ?? 0, Math.min(0.9, near * 0.8)));
    }

    const kind = this.record.kind;
    const duration = this.script.duration;
    const fadeIn = smooth(t / 1.5);
    const fadeOut = 1 - smooth((t - (duration - 2)) / 2);
    const levels = this.weatherAt(t, kind);
    this.deps.weather.setIntensity(levels.intensity);
    this.deps.weather.setWind(levels.wind);
    this.deps.weather.setRain(levels.rain);
    this.deps.sound?.("levels", levels.wind);

    this.deps.water.update({ t, wind: levels.wind, fade: fadeIn * fadeOut, pulses: this.pulses, fills: this.fills });
    this.deps.water.tick(nowMs / 1000, this.windDir);
    this.updateSky(t, kind, duration);
    this.drawBack(t);
    this.deps.sky.tick(nowMs);

    if (t >= duration && this.frozenAt === null) this.finish();
  }

  /** The deepest water on a tile or beside it now (for a khazan filling). */
  private nearbyDepth(key: string, t: number): number {
    const field = this.field!;
    let best = combinedDepth(field, key, t);
    const [q, r] = key.split(",").map(Number);
    for (let dir = 0; dir < 6; dir++) best = Math.max(best, combinedDepth(field, axialKey(neighbor({ q, r }, dir)), t));
    return best;
  }

  /**
   * Storm intensity (darkness, shake), wind and rain at storm time `t`: the
   * prototype's curves (building from 3 s to 12 s, easing over the last
   * stretch), with the lull before the hit: the wind drops while the sea
   * draws back, then the surge arrives.
   */
  private weatherAt(t: number, kind: string): { intensity: number; wind: number; rain: number } {
    const duration = this.script!.duration;
    const clearing = 1 - smooth((t - (duration - 10)) / 8);
    if (kind === "flood") {
      const rain = smooth((t - 3) / 8) * clearing;
      return { intensity: 0.66 * rain, wind: 0.25 * rain, rain: rain };
    }
    const landfall = this.field!.landfall ?? STORM_TIMING.cyclone.landfall;
    const [from, to] = STORM_TIMING.cyclone.drawBack;
    const build = smooth((t - 3) / 9);
    const lullStart = landfall - from + 0.5;
    const lullEnd = landfall - to;
    const lull = t > lullStart && t < lullEnd + 1 ? 1 - 0.55 * smooth((t - lullStart) / 1) * (1 - smooth((t - lullEnd) / 0.8)) : 1;
    const wind = Math.max(0.12, build * lull) * clearing;
    const rain = (kind === "compound" ? Math.max(smooth((t - 3) / 8), build) : build) * clearing;
    return { intensity: Math.min(1, build * clearing), wind, rain };
  }

  private updateSky(t: number, kind: string, duration: number): void {
    const sky = this.deps.sky;
    const level = this.weatherAt(t, kind).intensity;
    if (kind !== "flood") {
      // In from the open sea over 2–18 s, crossing the coast near its end,
      // then a little inland as it spins down and fades with the storm.
      const start = this.landfall.clone().addScaledVector(this.seaward, 15);
      const ashore = this.landfall.clone().addScaledVector(this.seaward, -1);
      const at = start.lerp(ashore, smooth((t - 2) / 16)).addScaledVector(this.seaward, -3 * smooth((t - 18) / 8));
      const grow = 0.6 + 0.4 * smooth((t - 2) / 9);
      const scale = grow * (1 - 0.25 * smooth((t - 18) / 8));
      sky.setSpiral(at.x, at.y, t * (this.deps.reducedMotion() ? 0.12 : 0.45), 0.62 * level, scale);
    }
    if (kind !== "cyclone") {
      const from = this.upstream.clone().add(new THREE.Vector2(8, 2));
      const at = from.lerp(this.upstream.clone().lerp(this.channelMid, 0.35), smooth(t / 12));
      const heading = Math.atan2(this.channelMid.y - this.upstream.y, this.channelMid.x - this.upstream.x);
      sky.setBand(at.x, at.y, -heading, 0.62 * level / (kind === "flood" ? 0.66 : 1) * (1 - smooth((t - (duration - 4)) / 4)));
    }
  }

  /** The sea draws back before the hit: the shallows by landfall show sand. */
  private drawBack(t: number): void {
    if (this.field?.landfall === null || this.shoreSea.length === 0) return;
    const landfall = this.field!.landfall!;
    const [from, to] = STORM_TIMING.cyclone.drawBack;
    const out = smooth((t - (landfall - from)) / 2) * (1 - smooth((t - (landfall - to)) / 1.2));
    for (const coord of this.shoreSea) this.deps.setTint(coord, out > 0.01 ? WET_SAND : null, out * 0.55);
  }

  private fire(event: StormEvent, nowMs: number, reduced: boolean): void {
    const toCoord = (key: string): AxialCoord => ({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) });
    switch (event.type) {
      case "house": {
        this.deps.houseLost(toCoord(event.key));
        this.hooks?.onHouseLost();
        this.deps.sound?.("house");
        break;
      }
      case "defence": {
        const coord = toCoord(event.key);
        this.pulses.set(event.key, 1);
        this.contacted.add(event.key);
        this.deps.defenceAnswers(coord, event.elementId);
        if (event.result === "failed") {
          this.deps.defenceFailed(coord);
          this.deps.sound?.("failed");
        } else {
          if (event.result === "overwhelmed") this.deps.defenceWorn(coord, this.deps.degradeAt(event.key));
          this.deps.sound?.(event.result === "held" ? "absorbed" : "overwhelmed");
        }
        // A word over the first few, so the screen does not fill with them.
        if (event.first || this.labelled < 4) {
          this.labelled++;
          this.deps.label(coord, event.result === "held" ? "Absorbed" : event.result === "overwhelmed" ? "Overwhelmed" : "Failed", event.result === "held" ? "good" : event.result === "overwhelmed" ? "warn" : "bad");
        }
        if (event.first && !reduced && !this.hooks?.hurry()) {
          this.slowUntilMs = nowMs + SLOW_SECONDS * 1000;
          const w = axialToWorld(coord, 1.0);
          this.deps.focusOn(w.x, w.z);
          this.deps.fitTo(20, 13);
          window.setTimeout(() => {
            if (this.record) this.frameCamera();
          }, 2600);
        }
        break;
      }
      case "landfall":
        this.deps.sound?.("landfall");
        break;
      case "lightning": {
        if (reduced) break;
        if (this.deps.weather.flash()) {
          const angle = event.seed * 2.39;
          const x = this.landfall.x + Math.cos(angle) * 2.5 + this.seaward.x * 2;
          const z = this.landfall.y + Math.sin(angle) * 2.5 + this.seaward.y * 2;
          this.deps.sky.strike(x, z, 0.4, nowMs, () => ((event.seed * 9301 + 49297) % 233280) / 233280);
          this.deps.screenFlash();
          window.setTimeout(() => this.deps.sound?.("thunder"), 350 + (event.seed % 4) * 250);
        }
        break;
      }
    }
  }

  /** Ends the storm now (its water drained, or a new one starting). */
  finish(): void {
    if (!this.record) return;
    // Anything the script had not reached yet still happens (a hurried storm).
    if (this.script) while (this.nextEvent < this.script.events.length) {
      const event = this.script.events[this.nextEvent++];
      if (event.type === "house" || (event.type === "defence" && event.result !== "held")) this.fire(event, 0, true);
    }
    for (const coord of this.shoreSea) this.deps.setTint(coord, null);
    this.deps.water.end();
    this.deps.sky.hide();
    this.deps.weather.setWind(null);
    this.deps.weather.setRain(null);
    this.deps.weather.setIntensity(0);
    this.deps.weather.autoLightning = true;
    this.deps.sound?.("end");
    this.record = null;
    this.field = null;
    this.hooks = null;
    this.frozenAt = null;
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.();
  }
}
