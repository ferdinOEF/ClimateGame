import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";

/**
 * The warning heat: one translucent layer over the board that turns the
 * tiles a coming storm will hit red, a little more each quarter.
 *
 * ONE layer, by design. Every heated tile is an instance of one flat hex in
 * one `InstancedMesh` with one shader, so the whole overlay is a single draw
 * call however many tiles are hot, and it is rebuilt only when the board or
 * the clock changes, never per frame (the shader animates the pulse from a
 * time uniform).
 *
 * It sits a hair above each tile's top surface: over the terrain colour and
 * the street-map layer (both drawn in the terrain's own shader), under every
 * building, defence and creature (opaque meshes that write depth, so they
 * hide the heat behind them), and under the DOM labels. It never writes
 * depth itself, so it cannot hide anything.
 *
 * Colour is never the only cue, for colour-blind players and grayscale:
 *   - a diagonal hatch on tiles above 30% heat (dark stripes, continuous
 *     across tiles because they are laid out in world space);
 *   - a slow pulsing dark edge on the most exposed tiles (the houses that
 *     will fall);
 *   - a shield shape, not just a green tint, on what the defences protect.
 */
export interface HeatTile {
  coord: AxialCoord;
  /** 0–0.5: this tile's opacity of red (ramp × exposure). */
  heat: number;
  /** Diagonal hatch (heat above 30%). */
  hatch: boolean;
  /** Slow pulsing edge (the most exposed tiles). */
  pulse: boolean;
  /** Green shield: a defence stands here, or a defence cut this tile's exposure. */
  shield: boolean;
}

const VERTEX = /* glsl */ `
  attribute float aHeat;
  attribute vec3 aFlags;
  varying vec2 vLocal;
  varying vec2 vWorld;
  varying float vHeat;
  varying vec3 vFlags;
  void main() {
    vLocal = position.xz;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    vHeat = aHeat;
    vFlags = aFlags;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  varying vec2 vLocal;
  varying vec2 vWorld;
  varying float vHeat;
  varying vec3 vFlags;

  // Distance to a pointy-top hex's edge, 0 at the centre and 1 on the edge.
  float hexEdge(vec2 p) {
    const float INRADIUS = 0.98 * 0.8660254;
    vec2 a = abs(p);
    float d = max(a.x, dot(a, vec2(0.5, 0.8660254)));
    return d / INRADIUS;
  }

  // A heater shield: flat top, straight sides, curving to a point. Returns
  // 1 inside, 0 outside, with a soft edge; 'outline' gets the rim.
  float shield(vec2 p, out float outline) {
    p.y = -p.y;
    float w = 0.15;
    float top = 0.17;
    float bottom = -0.2;
    float halfWidth = p.y > -0.02 ? w : w * clamp((p.y - bottom) / (-0.02 - bottom), 0.0, 1.0);
    float inside = step(abs(p.x), halfWidth) * step(p.y, top) * step(bottom, p.y);
    float rimWidth = 0.035;
    float halfInner = max(0.0, halfWidth - rimWidth);
    float core = step(abs(p.x), halfInner) * step(p.y, top - rimWidth) * step(bottom + rimWidth * 1.6, p.y);
    outline = inside * (1.0 - core);
    return inside;
  }

  void main() {
    float edge = hexEdge(vLocal);
    float hatch = vFlags.x;
    float pulse = vFlags.y;
    float isShield = vFlags.z;

    // Crimson rather than orange-red: over the beach's sand gold an orange
    // red reads as more sand, a crimson reads as a warning.
    vec3 red = vec3(0.80, 0.06, 0.17);
    vec3 color = red;
    float alpha = vHeat;

    if (hatch > 0.5) {
      // Stripes along the board's diagonal, about four per tile.
      float stripe = step(0.62, fract((vWorld.x + vWorld.y) * 2.4));
      color = mix(color, vec3(0.30, 0.02, 0.07), stripe);
      // Darker, a touch denser stripes, never past the 50% ceiling.
      alpha = mix(alpha, min(0.5, alpha + 0.14), stripe);
    }

    if (pulse > 0.5) {
      float wave = uMotion > 0.5 ? 0.5 + 0.5 * sin(uTime * 2.4) : 0.7;
      float band = smoothstep(0.8 - 0.06 * wave, 0.86, edge);
      color = mix(color, vec3(0.18, 0.02, 0.01), band);
      alpha = max(alpha, band * (0.3 + 0.2 * wave));
    }

    if (isShield > 0.5) {
      // A faint green wash where nothing is hot, then the shield itself in
      // the tile's upper-left, where a small building does not cover it.
      if (vHeat < 0.02) {
        color = vec3(0.16, 0.58, 0.32);
        alpha = 0.16 * (1.0 - smoothstep(0.9, 1.0, edge));
      }
      float rim;
      float inside = shield(vLocal - vec2(-0.48, -0.28), rim);
      if (inside > 0.5) {
        color = rim > 0.5 ? vec3(0.97, 0.98, 0.94) : vec3(0.12, 0.55, 0.28);
        alpha = 0.92;
      }
    }

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** Just above a tile's top face: over the terrain and the street map, under everything standing on it. */
const LIFT = 0.012;

export class HeatOverlay {
  readonly mesh: THREE.InstancedMesh;
  private readonly heat: THREE.InstancedBufferAttribute;
  private readonly flags: THREE.InstancedBufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private readonly scratch = new THREE.Matrix4();

  constructor(capacity: number, reducedMotion = false) {
    const geometry = new THREE.CircleGeometry(0.98, 6);
    // Into the ground plane, then a quarter turn so a vertex points along
    // ±Z: the same pointy-top orientation as the terrain's hex prisms.
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.PI / 2);
    this.heat = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.flags = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    geometry.setAttribute("aHeat", this.heat);
    geometry.setAttribute("aFlags", this.flags);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uTime: { value: 0 }, uMotion: { value: reducedMotion ? 0 : 1 } },
      transparent: true,
      depthWrite: false,
      // Lifted a hair in the depth test as well as in space, so the heat
      // never z-fights the tile under it at a grazing camera angle.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.name = "warning-heat";
    this.mesh.frustumCulled = false;
    // After the opaque board, before the place labels' DOM.
    this.mesh.renderOrder = 2;
  }

  /** Replaces the whole layer. `heightAt` gives each tile's top surface. */
  show(tiles: HeatTile[], heightAt: (coord: AxialCoord) => number): void {
    const count = Math.min(tiles.length, this.mesh.instanceMatrix.count);
    tiles.slice(0, count).forEach((tile, i) => {
      const { x, z } = axialToWorld(tile.coord, 1);
      this.mesh.setMatrixAt(i, this.scratch.makeTranslation(x, heightAt(tile.coord) + LIFT, z));
      this.heat.setX(i, Math.min(0.5, tile.heat));
      this.flags.setXYZ(i, tile.hatch ? 1 : 0, tile.pulse ? 1 : 0, tile.shield ? 1 : 0);
    });
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.heat.needsUpdate = true;
    this.flags.needsUpdate = true;
  }

  clear(): void {
    this.mesh.count = 0;
  }

  get visibleCount(): number {
    return this.mesh.count;
  }

  tick(nowMs: number): void {
    if (this.mesh.count > 0) this.material.uniforms.uTime.value = nowMs / 1000;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
