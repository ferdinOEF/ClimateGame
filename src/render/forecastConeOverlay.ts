import * as THREE from "three";
import { mergedArea } from "@core/areaShape";
import { axialKey, axialToWorld, neighbor, type AxialCoord } from "@core/hex";
import type { ConeBand, ConeTrack } from "@core/forecastCone";

/**
 * The forecast cone in the scene (Section 6.1), from `core/forecastCone.ts`:
 *
 *   - the three bands, one instanced hex per tile, told apart by lightness
 *     (dark, mid and light red), so they read in grayscale and deuteranopia;
 *   - "Where they meet" (the compound storm): indigo with diagonal stripes,
 *     so it differs by pattern as well as hue;
 *   - "Area to protect": a dashed outline (a dark dash on a light halo)
 *     round the houses at stake;
 *   - each storm's track: a dashed line with an arrowhead, dark on light.
 *
 * Layering: the bands sit on the tile tops like the warning heat (over the
 * terrain and the street map, under buildings, never writing depth); the
 * outline and the tracks draw over the board (no depth test) so a building
 * never cuts them. All of it is WebGL, under the DOM: the place labels, the
 * HUD and Maya are always on top.
 *
 * Motion: none but a fade. The whole cone fades in over 600 ms, once, and
 * out when it goes (at once with reduced motion). Nothing flashes, pulses or
 * moves, so it is safe for flash-sensitive players.
 */
export interface ConeShow {
  bands: Map<string, ConeBand>;
  meet: string[];
  area: string[];
  tracks: ConeTrack[];
}

const BAND_VERTEX = /* glsl */ `
  attribute float aBand;
  attribute float aMeet;
  varying vec2 vWorld;
  varying vec2 vLocal;
  varying float vBand;
  varying float vMeet;
  void main() {
    vLocal = position.xz;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    vBand = aBand;
    vMeet = aMeet;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BAND_FRAGMENT = /* glsl */ `
  uniform float uFade;
  varying vec2 vWorld;
  varying vec2 vLocal;
  varying float vBand;
  varying float vMeet;
  void main() {
    // Dark, mid and light red: the three bands differ by lightness.
    // Section 14: lighter, so the terrain shows through.
    vec3 color = vBand > 2.5 ? vec3(0.58, 0.08, 0.12) : vBand > 1.5 ? vec3(0.90, 0.38, 0.30) : vec3(0.99, 0.76, 0.68);
    float alpha = vBand > 2.5 ? 0.3 : vBand > 1.5 ? 0.24 : 0.18;
    if (vMeet > 0.5) {
      // Where they meet: indigo, hatched against the board's diagonal.
      float stripe = step(0.5, fract((vWorld.x - vWorld.y) * 2.2));
      color = mix(vec3(0.30, 0.22, 0.70), vec3(0.93, 0.92, 1.0), stripe * 0.85);
      alpha = 0.62;
    }
    gl_FragColor = vec4(color, alpha * uFade);
  }
`;

/** Just above a tile's top face, as the warning heat. */
const BAND_LIFT = 0.014;
/** The outline and tracks: a little higher, drawn without the depth test. */
const LINE_LIFT = 0.9;

export class ForecastConeOverlay {
  readonly group = new THREE.Group();
  private readonly bands: THREE.InstancedMesh;
  private readonly bandAttr: THREE.InstancedBufferAttribute;
  private readonly meetAttr: THREE.InstancedBufferAttribute;
  private readonly bandMaterial: THREE.ShaderMaterial;
  private readonly darkLine = new THREE.MeshBasicMaterial({ color: "#2a0c08", transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  private readonly lightLine = new THREE.MeshBasicMaterial({ color: "#fff3e0", transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  private lines: THREE.Mesh[] = [];
  /**
   * Section 30.7 (owner decision): after the cone goes (the phase's first build), the storm's track stays on the
   * board all phase, faint: the same dashed arrow (a cyclone's way in, or the flood's path down the river) at low
   * opacity. Its own group, so the cone's fade never touches it.
   */
  readonly trail = new THREE.Group();
  private readonly trailDark = new THREE.MeshBasicMaterial({ color: "#2a0c08", transparent: true, opacity: 0.42, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  private readonly trailLight = new THREE.MeshBasicMaterial({ color: "#fff3e0", transparent: true, opacity: 0.32, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  private trailKey = "";
  private readonly scratch = new THREE.Matrix4();
  private fade = 0;
  private fadeTarget = 0;
  private lastMs: number | null = null;
  /** With reduced motion the cone appears and goes at once: a static fade. */
  reducedMotion = false;
  /**
   * Each track's arrowhead in world space, its tip and the middle of its back edge (Section 22.2: the place pins
   * keep clear of it). Empty while the cone is hidden.
   */
  private heads: { tip: { x: number; y: number; z: number }; back: { x: number; y: number; z: number } }[] = [];

  constructor(capacity: number) {
    const geometry = new THREE.CircleGeometry(0.98, 6);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.PI / 2);
    this.bandAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.meetAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    geometry.setAttribute("aBand", this.bandAttr);
    geometry.setAttribute("aMeet", this.meetAttr);
    this.bandMaterial = new THREE.ShaderMaterial({
      vertexShader: BAND_VERTEX,
      fragmentShader: BAND_FRAGMENT,
      uniforms: { uFade: { value: 0 } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    this.bands = new THREE.InstancedMesh(geometry, this.bandMaterial, capacity);
    this.bands.count = 0;
    this.bands.frustumCulled = false;
    this.bands.renderOrder = 2;
    this.group.name = "forecast-cone";
    this.group.add(this.bands);
    this.group.visible = false;
    this.trail.name = "storm-trail";
    this.trail.visible = false;
  }

  /** Shows the faint track (Section 30.7); `key` names the storm, so the same trail is not rebuilt. */
  showTrail(key: string, tracks: ConeTrack[], heightAt: (coord: AxialCoord) => number): void {
    if (key === this.trailKey && this.trail.children.length > 0) {
      this.trail.visible = true;
      return;
    }
    this.clearTrail();
    this.trailKey = key;
    const nearestHeight = (x: number, z: number): number => heightAt(nearestCoord(x, z));
    for (const track of tracks) {
      const shapes = trackShapes(track, nearestHeight);
      for (const [positions, material, order] of [[shapes.halo, this.trailLight, 5], [shapes.dash, this.trailDark, 6]] as const) {
        if (positions.length === 0) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = order;
        mesh.frustumCulled = false;
        this.trail.add(mesh);
      }
    }
    this.trail.visible = this.trail.children.length > 0;
  }

  hideTrail(): void {
    this.trail.visible = false;
  }

  /** Is the faint trail on the board? */
  get trailShown(): boolean {
    return this.trail.visible && this.trail.children.length > 0;
  }

  private clearTrail(): void {
    for (const mesh of [...this.trail.children] as THREE.Mesh[]) {
      this.trail.remove(mesh);
      mesh.geometry.dispose();
    }
    this.trailKey = "";
  }

  /** Draws the cone and fades it in. `heightAt` gives each tile's top surface. */
  show(cone: ConeShow, heightAt: (coord: AxialCoord) => number): void {
    this.clearLines();
    const keys = [...new Set([...cone.bands.keys(), ...cone.meet])];
    const meet = new Set(cone.meet);
    const count = Math.min(keys.length, this.bands.instanceMatrix.count);
    keys.slice(0, count).forEach((key, i) => {
      const coord = coordOf(key);
      const { x, z } = axialToWorld(coord, 1);
      this.bands.setMatrixAt(i, this.scratch.makeTranslation(x, heightAt(coord) + BAND_LIFT, z));
      this.bandAttr.setX(i, cone.bands.get(key) ?? 1);
      this.meetAttr.setX(i, meet.has(key) ? 1 : 0);
    });
    this.bands.count = count;
    this.bands.instanceMatrix.needsUpdate = true;
    this.bandAttr.needsUpdate = true;
    this.meetAttr.needsUpdate = true;

    // Area to protect: a dashed outline round the houses at stake.
    // One shape round tiles a gap apart, not an island round each (Section 14).
    const outline = dashedOutline(mergedArea(cone.area).map(coordOf), heightAt);
    this.addLine(outline.halo, this.lightLine, 7);
    this.addLine(outline.dash, this.darkLine, 8);

    // The tracks, each a dashed line with an arrowhead.
    const nearestHeight = (x: number, z: number): number => heightAt(nearestCoord(x, z));
    this.heads = [];
    for (const track of cone.tracks) {
      const shapes = trackShapes(track, nearestHeight);
      this.addLine(shapes.halo, this.lightLine, 7);
      this.addLine(shapes.dash, this.darkLine, 8);
      if (shapes.head) this.heads.push(shapes.head);
    }
    this.group.visible = true;
    this.fadeTarget = 1;
    if (this.reducedMotion) {
      this.fade = 1;
      this.apply();
    }
  }

  /**
   * Section 30.8: while a build card is hovered, the cone's bands step back (a faint wash) so the homes the build
   * would save or put at risk show their glow underneath; its outline and tracks stay. Off: the cone as it was.
   */
  setDimmed(dimmed: boolean): void {
    this.dimmed = dimmed;
    this.apply();
  }

  private dimmed = false;

  /** Fades the cone out (`instant` removes it at once). */
  hide(instant = false): void {
    this.fadeTarget = 0;
    if (instant || this.reducedMotion) {
      this.fade = 0;
      this.apply();
    }
  }

  get isShown(): boolean {
    return this.group.visible && this.fadeTarget > 0;
  }

  /** The arrowheads drawn now (none while the cone is hidden or fading out). */
  get arrowHeads(): readonly { tip: { x: number; y: number; z: number }; back: { x: number; y: number; z: number } }[] {
    return this.isShown ? this.heads : [];
  }

  /** How many tiles carry a band or the meeting hatch (0 when hidden). */
  get tileCount(): number {
    return this.group.visible ? this.bands.count : 0;
  }

  tick(nowMs: number): void {
    // Wall time, not capped per frame: on a slow frame rate the fade still takes its 600 ms.
    const dt = this.lastMs === null ? 0 : Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;
    if (!this.group.visible) return;
    if (this.fade !== this.fadeTarget) {
      const step = dt / 600;
      this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step);
      this.apply();
    }
  }

  private apply(): void {
    this.bandMaterial.uniforms.uFade.value = this.fade * (this.dimmed ? 0.18 : 1);
    this.darkLine.opacity = 0.9 * this.fade;
    this.lightLine.opacity = 0.85 * this.fade;
    if (this.fade <= 0 && this.fadeTarget <= 0) {
      this.group.visible = false;
      this.bands.count = 0;
      this.clearLines();
    }
  }

  private addLine(positions: number[], material: THREE.Material, order: number): THREE.Mesh | null {
    if (positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.lines.push(mesh);
    return mesh;
  }

  private clearLines(): void {
    for (const mesh of this.lines) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.lines = [];
  }

  dispose(): void {
    this.clearLines();
    this.clearTrail();
    this.trailDark.dispose();
    this.trailLight.dispose();
    this.bands.geometry.dispose();
    this.bandMaterial.dispose();
    this.darkLine.dispose();
    this.lightLine.dispose();
  }
}

function coordOf(key: string): AxialCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/** The hex nearest a world point (size 1, pointy-top). */
function nearestCoord(x: number, z: number): AxialCoord {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * z);
  const r = (2 / 3) * z;
  let rx = Math.round(q);
  let rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q);
  const dy = Math.abs(ry - (-q - r));
  const dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  return { q: rx, r: rz };
}

/** A flat quad from a to b, `width` wide, at height y, as two triangles. */
function quad(out: number[], a: { x: number; z: number }, b: { x: number; z: number }, y: number, width: number): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const nx = (-dz / length) * (width / 2);
  const nz = (dx / length) * (width / 2);
  out.push(a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz, b.x - nx, y, b.z - nz, a.x + nx, y, a.z + nz, b.x - nx, y, b.z - nz, a.x - nx, y, a.z - nz);
}

/** Round the edge of a set of tiles: a light halo all round and a dark dash on it (two dashes an edge). */
function dashedOutline(tiles: AxialCoord[], heightAt: (coord: AxialCoord) => number): { halo: number[]; dash: number[] } {
  const halo: number[] = [];
  const dash: number[] = [];
  const inside = new Set(tiles.map(axialKey));
  for (const tile of tiles) {
    const centre = axialToWorld(tile, 1);
    const y = heightAt(tile) + LINE_LIFT;
    const corners = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 180) * (60 * i - 30);
      return { x: centre.x + Math.cos(angle), z: centre.z + Math.sin(angle) };
    });
    for (let dir = 0; dir < 6; dir++) {
      const next = neighbor(tile, dir);
      if (inside.has(axialKey(next))) continue;
      const other = axialToWorld(next, 1);
      const mid = { x: (centre.x + other.x) / 2, z: (centre.z + other.z) / 2 };
      const [a, b] = [...corners].sort((p, q) => (p.x - mid.x) ** 2 + (p.z - mid.z) ** 2 - ((q.x - mid.x) ** 2 + (q.z - mid.z) ** 2));
      quad(halo, a, b, y, 0.26);
      const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      quad(dash, at(0.08), at(0.42), y + 0.01, 0.13);
      quad(dash, at(0.58), at(0.92), y + 0.01, 0.13);
    }
  }
  return { halo, dash };
}

/** A track: a light halo, a dark dashed line on it, and an arrowhead at the end. */
function trackShapes(track: ConeTrack, heightAt: (x: number, z: number) => number): { halo: number[]; dash: number[]; head: { tip: { x: number; y: number; z: number }; back: { x: number; y: number; z: number } } | null } {
  const halo: number[] = [];
  const dash: number[] = [];
  const points = track.points;
  const DASH = 0.7;
  const GAP = 0.45;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const y = Math.max(heightAt(a.x, a.z), heightAt(b.x, b.z)) + LINE_LIFT + 0.05;
    // The halo stops short of the arrowhead on the last leg.
    const end = i + 2 === points.length ? Math.max(0, length - 0.9) : length;
    const along = (t: number) => ({ x: a.x + ((b.x - a.x) * t) / length, z: a.z + ((b.z - a.z) * t) / length });
    quad(halo, a, along(end), y, 0.42);
    for (let t = 0; t < end; t += DASH + GAP) quad(dash, along(t), along(Math.min(end, t + DASH)), y + 0.01, 0.2);
  }
  // The arrowhead at the last point, pointing along the last leg.
  const tip = points[points.length - 1];
  const from = points[points.length - 2];
  const length = Math.hypot(tip.x - from.x, tip.z - from.z) || 1;
  const ux = (tip.x - from.x) / length;
  const uz = (tip.z - from.z) / length;
  const y = heightAt(tip.x, tip.z) + LINE_LIFT + 0.07;
  const back = { x: tip.x - ux * 1.1, z: tip.z - uz * 1.1 };
  const wing = (s: number, w: number) => ({ x: back.x + -uz * w * s, z: back.z + ux * w * s });
  const outer = [tip, wing(1, 0.75), wing(-1, 0.75)];
  const inner = [{ x: tip.x - ux * 0.18, z: tip.z - uz * 0.18 }, wing(1, 0.52), wing(-1, 0.52)];
  for (const p of outer) halo.push(p.x, y, p.z);
  for (const p of inner) dash.push(p.x, y + 0.01, p.z);
  return { halo, dash, head: { tip: { x: tip.x, y, z: tip.z }, back: { x: back.x, y, z: back.z } } };
}
