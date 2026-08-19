import * as THREE from "three";
import { PALETTE } from "./palette";

export interface KhazanScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  start: (onFrame?: (nowMs: number) => void) => void;
  onResize: () => void;
  /** Re-centers the camera on a world (x, z) point, keeping the same distance/elevation. v2.1: the fixed map's own (0,0) is arbitrary relative to where the player actually starts. */
  focusOn: (x: number, z: number) => void;
}

const CAM_DISTANCE = 18;
const CAM_ELEVATION_DEG = 58; // slight top-down, not hard isometric

/**
 * Dorfromantik-style camera: a slight top-down perspective, pan/zoom only,
 * no free orbit. One directional sun + soft fog for depth, no multi-light rig.
 */
export function createScene(container: HTMLElement): KhazanScene {
  const scene = new THREE.Scene();
  scene.background = PALETTE.sky;
  scene.fog = new THREE.Fog(PALETTE.fog.getHex(), 18, 46);

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 200);
  const rad = THREE.MathUtils.degToRad(CAM_ELEVATION_DEG);

  function focusOn(x: number, z: number): void {
    camera.position.set(x, Math.sin(rad) * CAM_DISTANCE, z + Math.cos(rad) * CAM_DISTANCE);
    camera.lookAt(x, 0, z);
  }
  focusOn(0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
  sun.position.set(-8, 14, 6);
  scene.add(sun);

  const ambient = new THREE.HemisphereLight(PALETTE.sky.getHex(), 0x3a3a2a, 0.65);
  scene.add(ambient);

  function onResize(): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  function start(onFrame?: (nowMs: number) => void): void {
    renderer.setAnimationLoop((nowMs: number) => {
      onFrame?.(nowMs);
      renderer.render(scene, camera);
    });
  }

  return { scene, camera, renderer, sun, start, onResize, focusOn };
}
