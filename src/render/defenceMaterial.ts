import * as THREE from "three";

/**
 * The defences' shader (Section 14): every motion a defence makes, driven on
 * the GPU by one time uniform, so building a hundred of them adds no draw
 * calls and no per-object JavaScript. Each instance has a random phase (its
 * neighbours never move in step) and the moment it was built.
 *
 *   Build  — the defence pops up from its tile with a small overshoot (0.6 s)
 *            and its ring draws itself round the tile. With calm motion or
 *            Low quality it fades in instead.
 *   Idle   — foliage sways, grass ripples, water shimmers, foam pulses, the
 *            khazan's sluice gate rises and falls with the tide, the small
 *            dam's spillway runs. Off with calm motion or Low quality.
 *   Storm  — scaled by the storm's strength: foliage whips away from the sea
 *            (the wind's direction) and springs back, the gate lifts, the
 *            spillway becomes a torrent, foam brightens. With calm motion it
 *            is one gentle lean.
 *
 * The parts are tagged per vertex by `defenceGeometry.ts` (aSway, aPart).
 */
export interface DefenceUniforms {
  uTime: { value: number };
  /** 1: full motion; 0: calm motion or Low quality (idle off, fades, a gentle storm cue). */
  uMotion: { value: number };
  /** 0 calm to 1 the strongest storm, while one plays. */
  uStorm: { value: number };
  /** Where the wind blows toward, world x/z (unit). */
  uWindDir: { value: THREE.Vector2 };
}

export function createDefenceUniforms(): DefenceUniforms {
  return {
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uStorm: { value: 0 },
    uWindDir: { value: new THREE.Vector2(-1, 0) }
  };
}

/** Seconds on the shader's clock: the same for the time uniform and each instance's build moment. */
export function shaderSeconds(nowMs: number): number {
  return (nowMs / 1000) % 100000;
}

export function createDefenceMaterial(uniforms: DefenceUniforms, doubleSided = false): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, vertexColors: true, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
attribute float aSway;
attribute float aPart;
attribute float aPhase;
attribute float aBorn;
uniform float uTime;
uniform float uMotion;
uniform float uStorm;
uniform vec2 uWindDir;
varying float vPart;
varying vec3 vLocal;
varying float vAge;
varying float vPhase;`
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `vec3 transformed = vec3(position);
vPart = aPart;
vLocal = position;
vPhase = aPhase;
float age = uTime - aBorn;
vAge = age;
// Build: pops up with a small overshoot (the ring draws itself instead).
if (abs(aPart - 6.0) > 0.5 && uMotion > 0.5 && age >= 0.0 && age < 0.6) {
  float t = clamp(age / 0.6, 0.0, 1.0);
  float s = 1.0 - pow(1.0 - t, 3.0) + 0.16 * sin(t * 3.14159);
  transformed *= max(s, 0.001);
}
// The wind in this instance's own frame (it is turned to face the sea).
vec3 wDir = vec3(uWindDir.x, 0.0, uWindDir.y);
#ifdef USE_INSTANCING
wDir = transpose(mat3(instanceMatrix)) * wDir;
#endif
wDir = normalize(wDir + vec3(1e-5, 0.0, 0.0));
vec3 perp = vec3(-wDir.z, 0.0, wDir.x);
float idle = uMotion * aSway * 0.022 * sin(uTime * 1.6 + aPhase + position.x * 4.0 + position.z * 3.0);
// Storm: a hard lean away from the sea that pulses as gusts pass and springs back.
float gust = 0.5 + 0.5 * sin(uTime * (2.0 + 5.0 * uMotion) + aPhase + position.z * 3.0);
float storm = uStorm * aSway * (0.05 + 0.09 * gust) * mix(0.4, 1.0, uMotion);
transformed += wDir * storm + (wDir * 0.6 + perp) * idle;
if (aPart > 6.5) {
  transformed += (wDir * 0.5 + perp) * uMotion * aSway * 0.03 * sin(uTime * 2.4 + aPhase + position.z * 9.0);
}
if (abs(aPart - 4.0) < 0.5) {
  // The sluice gate: rises and falls slowly with the tide; lifts in a flood.
  transformed.y += uMotion * (0.5 + 0.5 * sin(uTime * 0.45 + aPhase)) * 0.06 + uStorm * 0.08;
}`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform float uTime;
uniform float uMotion;
uniform float uStorm;
varying float vPart;
varying vec3 vLocal;
varying float vAge;
varying float vPhase;`
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
if (abs(vPart - 6.0) < 0.5) {
  // The ring draws itself round the tile after the pop.
  float ang = atan(vLocal.z, vLocal.x) / 6.28318 + 0.5;
  // A negative age (the shader clock wrapped after a day's uptime) counts as long built.
  float prog = uMotion > 0.5 && vAge >= 0.0 ? clamp((vAge - 0.2) / 0.5, 0.0, 1.0) : 1.0;
  if (ang > prog) discard;
}
if (uMotion < 0.5 && vAge >= 0.0 && vAge < 0.6) {
  // Calm motion: a fade in place of the pop (a dissolve, so nothing is transparent).
  float d = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (d > vAge / 0.6) discard;
}
if (abs(vPart - 2.0) < 0.5) {
  float sh = sin(vLocal.x * 18.0 + uTime * 1.8 + vPhase) * sin(vLocal.z * 15.0 - uTime * 1.3);
  diffuseColor.rgb *= 1.0 + uMotion * 0.1 * sh;
}
if (abs(vPart - 3.0) < 0.5) {
  float p = 0.5 + 0.5 * sin(uTime * 2.2 + vPhase + vLocal.z * 4.0);
  diffuseColor.rgb *= mix(1.0, 0.82 + 0.18 * p, uMotion);
  diffuseColor.rgb = min(vec3(1.0), diffuseColor.rgb + uStorm * 0.12);
}
if (abs(vPart - 5.0) < 0.5) {
  float speed = 1.0 + 4.0 * uStorm;
  float stripe = step(0.55, fract(vLocal.x * 9.0 + vLocal.z * 2.0 - uTime * speed));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.97, 1.0), stripe * 0.5 * max(uMotion, uStorm));
}`
      );
  };
  // Distinct programs per uniform set are not needed: every defence shares one.
  material.customProgramCacheKey = () => `defence-v1-${doubleSided ? "d" : "f"}`;
  return material;
}
