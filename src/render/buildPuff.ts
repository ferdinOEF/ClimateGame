import * as THREE from "three";
import { shaderSeconds } from "./defenceMaterial";

/**
 * The small puff when a defence is built (Section 14), in its own material:
 * sand for a dune or pandanus, leaves for a mangrove, dust for a seawall,
 * dam or breakwater, mud for a khazan. One `Points` object for every puff:
 * a pool of slots, each a handful of particles whose flight the shader works
 * out from the time uniform, so a puff costs no per-frame JavaScript and no
 * extra draw call. Off with calm motion or Low quality (the defence fades in
 * instead).
 */
const SLOTS = 8;
const PER_PUFF = 18;
const LIFE = 0.9;

const MATERIAL_COLOURS: Record<string, string[]> = {
  sand: ["#e9d39c", "#d9bd7f", "#f3e4b8"],
  leaves: ["#2f6a34", "#4c8c3a", "#6fa24a"],
  dust: ["#cfcdc5", "#b9b7af", "#e2e0d8"],
  mud: ["#8a6a3e", "#a9793f", "#6e5232"]
};

const KIND_OF: Record<string, keyof typeof MATERIAL_COLOURS> = {
  dune: "sand",
  sandy_vegetation: "sand",
  mangrove: "leaves",
  seawall: "dust",
  small_dam: "dust",
  breakwater: "dust",
  khazan: "mud"
};

export class BuildPuff {
  readonly points: THREE.Points;
  private readonly origin: THREE.BufferAttribute;
  private readonly dir: THREE.BufferAttribute;
  private readonly start: THREE.BufferAttribute;
  private readonly colour: THREE.BufferAttribute;
  private readonly uniforms = { uTime: { value: 0 }, uScale: { value: 300 } };
  private next = 0;
  enabled = true;

  constructor() {
    const count = SLOTS * PER_PUFF;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.origin = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.dir = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.start = new THREE.BufferAttribute(new Float32Array(count).fill(-1000), 1);
    this.colour = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute("aOrigin", this.origin);
    geometry.setAttribute("aDir", this.dir);
    geometry.setAttribute("aStart", this.start);
    geometry.setAttribute("aColour", this.colour);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aOrigin;
        attribute vec3 aDir;
        attribute float aStart;
        attribute vec3 aColour;
        uniform float uTime;
        uniform float uScale;
        varying vec3 vColour;
        varying float vLife;
        void main() {
          float t = (uTime - aStart) / ${LIFE.toFixed(2)};
          vLife = t;
          vColour = aColour;
          // Out and up, then settling: a puff, not a fountain.
          vec3 p = aOrigin + aDir * (1.0 - pow(1.0 - clamp(t, 0.0, 1.0), 2.0)) + vec3(0.0, -0.25 * t * t, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (t < 0.0 || t > 1.0) ? 0.0 : uScale * (0.05 + 0.03 * (1.0 - t)) / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColour;
        varying float vLife;
        void main() {
          if (vLife < 0.0 || vLife > 1.0) discard;
          vec2 d = gl_PointCoord - 0.5;
          if (dot(d, d) > 0.25) discard;
          gl_FragColor = vec4(vColour, 0.85 * (1.0 - vLife));
        }`
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  /** A puff for `elementId` at a world point; nothing for anything that is not a redrawn defence. */
  play(elementId: string, x: number, y: number, z: number, nowMs: number): void {
    const kind = KIND_OF[elementId];
    if (!kind || !this.enabled) return;
    const slot = this.next;
    this.next = (this.next + 1) % SLOTS;
    const t0 = shaderSeconds(nowMs) + 0.05;
    const colours = MATERIAL_COLOURS[kind].map((hex) => new THREE.Color(hex));
    for (let i = 0; i < PER_PUFF; i++) {
      const k = slot * PER_PUFF + i;
      const a = (i / PER_PUFF) * Math.PI * 2 + Math.random() * 0.4;
      const out = 0.45 + Math.random() * 0.35;
      this.origin.setXYZ(k, x + Math.cos(a) * 0.25, y + 0.05, z + Math.sin(a) * 0.25);
      this.dir.setXYZ(k, Math.cos(a) * out, 0.25 + Math.random() * 0.35, Math.sin(a) * out);
      this.start.setX(k, t0 + Math.random() * 0.08);
      const c = colours[i % colours.length];
      this.colour.setXYZ(k, c.r, c.g, c.b);
    }
    this.origin.needsUpdate = true;
    this.dir.needsUpdate = true;
    this.start.needsUpdate = true;
    this.colour.needsUpdate = true;
  }

  /** Each frame: the clock, and the point size for the drawing buffer's height. */
  /** QA only: holds the clock at a moment (seconds), or lets it run with null. */
  frozenShaderSeconds: number | null = null;

  tick(nowMs: number, viewportHeight: number): void {
    this.uniforms.uTime.value = this.frozenShaderSeconds ?? shaderSeconds(nowMs);
    this.uniforms.uScale.value = viewportHeight;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
