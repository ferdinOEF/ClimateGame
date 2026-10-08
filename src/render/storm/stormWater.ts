import * as THREE from "three";
import { axialToWorld, axialKey, neighbor } from "@core/hex";
import { floodDepth, surgeDepth, type DepthField } from "@core/hazard";

/**
 * The storm's water: the sea swelling and the surge coming ashore, the river
 * rising and spilling over its banks, the khazans filling. One instanced
 * hexagon per wet tile, in one `InstancedMesh` with one shader: a single
 * draw call however much of the board is under water.
 *
 * Every tile's water level comes from the depth field (core/hazard.ts), the
 * same numbers that decided which houses fell, read at the storm's clock
 * each frame. `depthDrawn` reports the depth this layer last drew on a tile,
 * so the browser checks can prove the drawn water is the resolved water.
 *
 * Colours: the sea's surge is a light turquoise-blue, river water a deep
 * navy that darkens as it rises (never brown or amber, so it cannot read as
 * the warning heat), and where both meet, indigo. Khazans fill teal. Flooded
 * land also carries a wavy stripe pattern, so a flooded tile reads without
 * colour (grayscale, colour-blind players).
 *
 * The shader animates waves (Gerstner, lower behind mangroves), foam at the
 * water's edge, ripples, flow streaks down the channel and the swell's crest
 * from a time uniform; the CPU only writes a few numbers per tile per frame.
 */

/** World units of water per damage unit. A house is lost at 1, so the line is about a fifth of a tile up its walls. */
export const DEPTH_TO_WORLD = 0.2;
/** Depth drawn is capped here (damage units), so a huge storm does not bury the board. */
const DRAW_CAP = 2.8;

export type WaterQuality = "low" | "medium" | "high";

const RINGS: Record<WaterQuality, number> = { low: 1, medium: 3, high: 4 };

/** A flat hexagon of `rings` rings of triangles, pointy along z like the terrain tiles, with `aEdge` 0 at the centre to 1 on the rim. */
export function waterHexGeometry(radius: number, rings: number): THREE.BufferGeometry {
  const corners: THREE.Vector2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    corners.push(new THREE.Vector2(Math.sin(a) * radius, Math.cos(a) * radius));
  }
  const positions: number[] = [];
  const edges: number[] = [];
  const point = (k: number, i: number, j: number): [number, number, number] => {
    // Sector k, ring i (0 centre .. rings rim), step j along the ring (0..i).
    const a = corners[k];
    const b = corners[(k + 1) % 6];
    if (i === 0) return [0, 0, 0];
    const t = j / i;
    const s = i / rings;
    return [(a.x + (b.x - a.x) * t) * s, (a.y + (b.y - a.y) * t) * s, s];
  };
  const push = (p: [number, number, number]): void => {
    positions.push(p[0], 0, p[1]);
    edges.push(p[2]);
  };
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j <= i; j++) {
        // Upward triangle.
        push(point(k, i, j));
        push(point(k, i + 1, j + 1));
        push(point(k, i + 1, j));
        if (j < i) {
          // Downward triangle.
          push(point(k, i, j));
          push(point(k, i, j + 1));
          push(point(k, i + 1, j + 1));
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aEdge", new THREE.Float32BufferAttribute(edges, 1));
  return geometry;
}

const VERTEX = /* glsl */ `
  attribute float aEdge;
  attribute vec4 aWater;   // level (world y), kind (0 sea, 1 channel, 2 land, 3 khazan), wave amplitude, alpha
  attribute vec4 aLook;    // sea share, river share, crest, pulse
  attribute vec4 aFlow;    // flow dir x, flow dir z, flow speed, shore (foam at the rim)
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uMotion;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vEdge;
  varying vec4 vWater;
  varying vec4 vLook;
  varying vec4 vFlow;
  varying float vHeight;

  // One Gerstner wave: direction, wavelength, steepness. Returns the offset and adds to the normal's slope.
  vec3 gerstner(vec2 p, vec2 dir, float wavelength, float steep, float amp, inout vec2 slope) {
    float k = 6.28318 / wavelength;
    float c = sqrt(9.8 / k) * 0.35;
    float f = k * (dot(dir, p) - c * uTime * uMotion);
    float a = amp;
    slope += dir * (k * a * cos(f));
    return vec3(dir.x * (steep * a * cos(f)), a * sin(f), dir.y * (steep * a * cos(f)));
  }

  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    world.y = aWater.x;
    vec2 slope = vec2(0.0);
    float amp = aWater.z;
    vec3 offset = vec3(0.0);
    if (amp > 0.0) {
      // The rim stays put so neighbouring tiles' water meets; the waves live inside.
      float inner = 1.0 - smoothstep(0.75, 1.0, aEdge);
      vec2 d1 = normalize(uWindDir);
      vec2 d2 = normalize(uWindDir + vec2(0.45, -0.3));
      vec2 d3 = normalize(uWindDir + vec2(-0.5, 0.4));
      offset += gerstner(world.xz, d1, 3.2, 0.6, amp, slope);
      offset += gerstner(world.xz, d2, 1.9, 0.5, amp * 0.55, slope);
      offset += gerstner(world.xz, d3, 1.1, 0.4, amp * 0.3, slope);
      offset *= inner;
      slope *= inner;
    }
    world.xyz += offset;
    vHeight = offset.y / max(0.001, amp + 0.001);
    vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vWorld = world.xyz;
    vEdge = aEdge;
    vWater = aWater;
    vLook = aLook;
    vFlow = aFlow;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  uniform vec3 uSunDir;
  uniform vec3 uSeaLight;
  uniform vec3 uSeaDeep;
  uniform vec3 uRiverLight;
  uniform vec3 uRiverDeep;
  uniform vec3 uBoth;
  uniform vec3 uKhazan;
  uniform float uPattern;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vEdge;
  varying vec4 vWater;
  varying vec4 vLook;
  varying vec4 vFlow;
  varying float vHeight;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    float kind = vWater.y;
    float alpha = vWater.w;
    if (alpha <= 0.002) discard;
    if (kind > 3.5) {
      // A defence answering on dry ground: a pale green rim that pulses, nothing inside.
      float rim = smoothstep(0.62, 0.9, vEdge) * (1.0 - smoothstep(0.97, 1.0, vEdge));
      if (rim < 0.02) discard;
      gl_FragColor = vec4(0.62, 1.0, 0.66, clamp(alpha * 1.4, 0.0, 1.0) * rim);
      return;
    }
    float sea = vLook.x;
    float river = vLook.y;
    float crest = vLook.z;
    float pulse = vLook.w;
    float depth = clamp(sea + river, 0.0, 2.8);
    float t = uTime * uMotion;

    // Colour: sea turquoise-blue, river navy, both indigo; deeper is darker.
    float total = max(0.0001, sea + river);
    float riverShare = river / total;
    float both = 4.0 * riverShare * (1.0 - riverShare);
    vec3 seaCol = mix(uSeaLight, uSeaDeep, clamp(sea / 2.0, 0.0, 1.0));
    vec3 riverCol = mix(uRiverLight, uRiverDeep, clamp(river / 2.0, 0.0, 1.0));
    vec3 col = mix(seaCol, riverCol, riverShare);
    col = mix(col, uBoth, clamp(both * 0.85, 0.0, 0.85));
    if (kind > 2.5) col = mix(uKhazan, col, 0.25);
    // The open sea is deeper and darker than water over the land.
    if (kind < 0.5) col = mix(vec3(0.13, 0.38, 0.54), col, 0.45);

    // Light: soft diffuse and a small glint, so the waves read as relief.
    float diffuse = 0.62 + 0.38 * max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
    col *= diffuse;

    // White chop on the river as it rises; whitecaps on wave crests at sea.
    float chop = smoothstep(0.86, 0.97, noise(vWorld.xz * 6.0 + vec2(t * 1.3, -t * 0.9))) * clamp(river * 0.6, 0.0, 0.6);
    float caps = smoothstep(0.7, 1.0, vHeight) * smoothstep(0.55, 0.85, noise(vWorld.xz * 5.0 + vec2(t * 0.6, t * 0.3))) * smoothstep(0.05, 0.12, vWater.z) * 0.7;
    col = mix(col, vec3(0.94, 0.97, 1.0), clamp(chop + caps, 0.0, 0.85));

    // Flow streaks down the channel, faster as the flood rises.
    if (vFlow.z > 0.0) {
      vec2 dir = normalize(vFlow.xy + vec2(0.0001));
      float along = dot(vWorld.xz, dir);
      float across = dot(vWorld.xz, vec2(-dir.y, dir.x));
      float streak = smoothstep(0.9, 1.0, fract(along * 1.6 - t * vFlow.z)) * smoothstep(0.35, 0.8, noise(vec2(across * 6.0, floor(along * 1.6 - t * vFlow.z))));
      col = mix(col, vec3(0.86, 0.92, 1.0), streak * 0.55);
    }

    // The swell's bright crest passing.
    col = mix(col, vec3(0.92, 0.97, 1.0), clamp(crest, 0.0, 1.0) * 0.38);

    // Foam at the water's edge, and ripples spreading on flooded land.
    float shore = vFlow.w;
    float foamLine = smoothstep(0.78, 0.98, vEdge) * (0.55 + 0.45 * noise(vWorld.xz * 9.0 + t * 0.7));
    col = mix(col, vec3(1.0), foamLine * shore * 0.85);
    if (kind > 1.5) {
      float ripple = smoothstep(0.85, 1.0, sin(vEdge * 18.0 - t * 3.0) * 0.5 + 0.5) * (1.0 - vEdge) * 0.25;
      col = mix(col, vec3(0.9, 0.95, 1.0), ripple);
    }

    // Not colour alone: flooded land and khazans carry wavy stripes.
    if (kind > 1.5 && uPattern > 0.5) {
      float wave = sin((vWorld.x + vWorld.z) * 7.0 + sin((vWorld.x - vWorld.z) * 3.0) * 1.2);
      float stripe = smoothstep(0.55, 0.85, wave);
      col = mix(col, col * 0.78, stripe * clamp(depth * 0.9 + 0.3, 0.0, 0.8));
    }

    // Khazan holding the water: a slow shimmer; absorbing it: a bright pulse.
    if (kind > 2.5) {
      float shimmer = smoothstep(0.82, 1.0, noise(vWorld.xz * 5.0 + vec2(t * 0.4, t * 0.25))) * 0.35;
      col = mix(col, vec3(0.8, 1.0, 0.95), shimmer);
    }
    col = mix(col, vec3(0.85, 1.0, 0.96), clamp(pulse, 0.0, 1.0) * 0.6);

    gl_FragColor = vec4(col, alpha);
  }
`;

export interface WaterTile {
  key: string;
  q: number;
  r: number;
  terrainId: string;
  /** Top of the tile in world units. */
  top: number;
}

interface Slot {
  key: string;
  terrainId: string;
  top: number;
  index: number;
  sea: boolean;
  channel: boolean;
  khazan: boolean;
  /** A defence stands here: when dry, its tile shows only the glow of it answering. */
  defence: boolean;
  /** Wave amplitude for this tile (sheltered tiles behind mangroves get less). */
  amp: number;
  flow: THREE.Vector2;
  neighbours: number[];
}

export interface WaterFrame {
  /** Storm time, seconds. */
  t: number;
  /** 0–1: how hard the wind blows (drives the sea's wave height). */
  wind: number;
  /** 0–1: the layer's fade (in at the start, out at the end). */
  fade: number;
  /** Pulse 0–1 per tile (a defence absorbing the water), by key. */
  pulses: ReadonlyMap<string, number>;
  /**
   * Khazans: how full each one is (damage units of stored water), by key.
   * Stored water, not flood: a khazan holds what would otherwise spread, and
   * no house stands in one, so it never counts toward a house's depth.
   */
  fills?: ReadonlyMap<string, number>;
}

export class StormWater {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private slots: Slot[] = [];
  private readonly bySlotKey = new Map<string, Slot>();
  private field: DepthField | null = null;
  private readonly water: THREE.InstancedBufferAttribute;
  private readonly look: THREE.InstancedBufferAttribute;
  private readonly flow: THREE.InstancedBufferAttribute;
  private readonly drawn = new Map<string, number>();
  private lastT = 0;
  private readonly capacity: number;

  constructor(capacity: number, quality: WaterQuality = "high") {
    this.capacity = capacity;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
        uSunDir: { value: new THREE.Vector3(-8, 14, 6).normalize() },
        uSeaLight: { value: new THREE.Color("#7cc6e0") },
        uSeaDeep: { value: new THREE.Color("#3c96c8") },
        uRiverLight: { value: new THREE.Color("#3f7fb3") },
        uRiverDeep: { value: new THREE.Color("#123e7d") },
        uBoth: { value: new THREE.Color("#5846a0") },
        uKhazan: { value: new THREE.Color("#4abec8") },
        uPattern: { value: 1 }
      }
    });
    this.mesh = new THREE.InstancedMesh(waterHexGeometry(1.0, RINGS[quality]), this.material, capacity);
    this.mesh.name = "storm-water";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.water = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.flow = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    for (const attr of [this.water, this.look, this.flow]) attr.setUsage(THREE.DynamicDrawUsage);
    this.mesh.geometry.setAttribute("aWater", this.water);
    this.mesh.geometry.setAttribute("aLook", this.look);
    this.mesh.geometry.setAttribute("aFlow", this.flow);
    this.mesh.visible = false;
  }

  /** Changes the wave mesh's detail (Low/Medium/High). */
  setQuality(quality: WaterQuality): void {
    const old = this.mesh.geometry;
    const next = waterHexGeometry(1.0, RINGS[quality]);
    next.setAttribute("aWater", this.water);
    next.setAttribute("aLook", this.look);
    next.setAttribute("aFlow", this.flow);
    this.mesh.geometry = next;
    old.dispose();
  }

  /** Reduced motion: calmer waves and no moving patterns beyond a slow drift. */
  setReducedMotion(reduced: boolean): void {
    this.material.uniforms.uMotion.value = reduced ? 0.35 : 1;
  }

  /**
   * Lays out the water for one storm: every sea and channel tile, and every
   * tile the storm's water reaches. `elementAt` names what stands on a tile
   * (khazans fill teal; mangroves calm the sea next to them).
   */
  begin(field: DepthField, tiles: WaterTile[], elementAt: (key: string) => string | undefined, isDefence: (key: string) => boolean = () => false): void {
    this.field = field;
    this.slots = [];
    this.bySlotKey.clear();
    this.drawn.clear();
    const mangroves = new Set(tiles.filter((tile) => elementAt(tile.key) === "mangrove").map((tile) => tile.key));
    const matrix = new THREE.Matrix4();
    for (const tile of tiles) {
      const depth = field.tiles.get(tile.key);
      if (!depth) continue;
      const sea = tile.terrainId === "coast";
      const channel = tile.terrainId === "river" || tile.terrainId === "estuary";
      const wet = depth.surgePeak > 0 || depth.floodPeak > 0 || depth.backwaterPeak > 0;
      const khazan = elementAt(tile.key) === "khazan";
      // Wetland and river tiles join only where this storm's water reaches them: a cyclone must not paint the marshes blue.
      const defence = isDefence(tile.key);
      if (!sea && !wet && !defence && !(khazan && field.kind !== "cyclone")) continue;
      if (this.slots.length >= this.capacity) break;
      const index = this.slots.length;
      // Waves are lower behind mangroves: within two tiles of a belt.
      let shelter = 1;
      if (mangroves.size > 0) {
        for (let dir = 0; dir < 6 && shelter === 1; dir++) {
          const n = axialKey(neighbor(tile, dir));
          if (mangroves.has(n)) shelter = 0.4;
          else {
            const [nq, nr] = n.split(",").map(Number);
            for (let d2 = 0; d2 < 6; d2++) if (mangroves.has(axialKey(neighbor({ q: nq, r: nr }, d2)))) shelter = Math.min(shelter, 0.65);
          }
        }
      }
      const slot: Slot = {
        key: tile.key,
        terrainId: tile.terrainId,
        top: tile.top,
        index,
        sea,
        channel,
        khazan,
        defence,
        amp: (sea ? 0.075 : channel ? 0.025 : 0.008) * shelter,
        flow: new THREE.Vector2(),
        neighbours: []
      };
      const { x, z } = axialToWorld(tile, 1.0);
      matrix.makeTranslation(x, 0, z);
      this.mesh.setMatrixAt(index, matrix);
      this.slots.push(slot);
      this.bySlotKey.set(tile.key, slot);
    }
    // Neighbours (for foam at the edge) and the downstream direction on the channel.
    for (const slot of this.slots) {
      const [q, r] = slot.key.split(",").map(Number);
      const here = axialToWorld({ q, r }, 1.0);
      const index = field.tiles.get(slot.key)?.riverIndex ?? null;
      for (let dir = 0; dir < 6; dir++) {
        const nCoord = neighbor({ q, r }, dir);
        const nKey = axialKey(nCoord);
        const n = this.bySlotKey.get(nKey);
        slot.neighbours.push(n ? n.index : -1);
        const nIndex = field.tiles.get(nKey)?.riverIndex ?? null;
        if (index !== null && nIndex !== null && nIndex > index) {
          const there = axialToWorld(nCoord, 1.0);
          slot.flow.add(new THREE.Vector2(there.x - here.x, there.z - here.z));
        }
      }
      if (slot.flow.lengthSq() > 0) slot.flow.normalize();
    }
    this.mesh.count = this.slots.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = this.slots.length > 0;
  }

  /** Writes every tile's water for storm time `frame.t`. */
  update(frame: WaterFrame): void {
    const field = this.field;
    if (!field || this.slots.length === 0) return;
    this.lastT = frame.t;
    const water = this.water.array as Float32Array;
    const look = this.look.array as Float32Array;
    const flow = this.flow.array as Float32Array;
    const levels = new Float32Array(this.slots.length);
    for (const slot of this.slots) {
      const surge = surgeDepth(field, slot.key, frame.t);
      const flood = floodDepth(field, slot.key, frame.t);
      const depth = Math.max(0, surge) + flood;
      this.drawn.set(slot.key, depth);
      const stored = slot.khazan ? frame.fills?.get(slot.key) ?? 0 : 0;
      const shown = Math.min(DRAW_CAP, Math.max(depth, stored));
      // Wave height now; the water sits high enough that its troughs never dip into the tile.
      const amp = slot.amp * (slot.sea ? 0.35 + frame.wind * 1.9 : 0.5 + Math.min(1, flood) * 1.2);
      const base = slot.top + 0.03 + amp;
      const level = base + (slot.sea ? surge : shown) * DEPTH_TO_WORLD;
      levels[slot.index] = level;
      const wetLand = !slot.sea && !slot.channel;
      const pulse = frame.pulses.get(slot.key) ?? 0;
      const wetness = Math.min(1, Math.max(depth, stored) / 0.06);
      // A dry defence: just its glow, while it answers.
      const glowOnly = slot.defence && wetness < 0.5;
      const visible = glowOnly ? pulse : wetLand ? wetness : 1;
      const i4 = slot.index * 4;
      water[i4] = level;
      water[i4 + 1] = glowOnly ? 4 : slot.sea ? 0 : slot.channel ? 1 : slot.khazan ? 3 : 2;
      water[i4 + 2] = amp;
      water[i4 + 3] = frame.fade * visible * (wetLand ? 0.82 : slot.sea ? 0.78 : 0.86);
      look[i4] = Math.max(0, surge);
      look[i4 + 1] = Math.max(flood, stored);
      // The swell's crest: bright just as the water reaches its peak here.
      const tile = field.tiles.get(slot.key)!;
      // The swell's pale crest rides its front, just as the water starts to lift here.
      const crestAt = tile.floodArrival + 0.6;
      look[i4 + 2] = Number.isFinite(crestAt) && tile.floodPeak > 0 && slot.channel ? Math.exp(-(((frame.t - crestAt) / 0.9) ** 2)) : 0;
      look[i4 + 3] = pulse;
      flow[i4] = slot.flow.x;
      flow[i4 + 1] = slot.flow.y;
      flow[i4 + 2] = slot.channel ? 0.4 + Math.min(2, flood) * 0.9 : 0;
    }
    // Foam on the advancing front: shallow water just arriving or about to
    // dry out wears a white rim (the prototype's edge), deep water does not.
    for (const slot of this.slots) {
      const depth = this.drawn.get(slot.key) ?? 0;
      flow[slot.index * 4 + 3] = !slot.sea && depth > 0.005 && depth < 0.18 ? 1 - depth / 0.18 : 0;
    }
    this.water.needsUpdate = true;
    this.look.needsUpdate = true;
    this.flow.needsUpdate = true;
  }

  /** Advances the shader's clock (seconds of real time, so waves keep moving in slow motion, just slower). */
  tick(seconds: number, windDir?: THREE.Vector2): void {
    this.material.uniforms.uTime.value = seconds;
    if (windDir) this.material.uniforms.uWindDir.value.copy(windDir);
  }

  /** The depth (damage units) this layer last drew on a tile, and the storm time it drew it at. For the checks. */
  depthDrawn(key: string): { depth: number; t: number } | null {
    const depth = this.drawn.get(key);
    return depth === undefined ? null : { depth, t: this.lastT };
  }

  end(): void {
    this.field = null;
    this.slots = [];
    this.bySlotKey.clear();
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
