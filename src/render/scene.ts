import * as THREE from "three";
import { PALETTE } from "./palette";

export interface KhazanScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  start: () => void;
  onResize: () => void;
}

/**
 * Dorfromantik-style camera: a slight top-down perspective, pan/zoom only,
 * no free orbit. One directional sun + soft fog for depth, no multi-light rig.
 */
export function createScene(container: HTMLElement): KhazanScene {
  const scene = new THREE.Scene();
  scene.background = PALETTE.sky;
  scene.fog = new THREE.Fog(PALETTE.fog.getHex(), 18, 46);

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 200);
  const camDistance = 18;
  const camElevationDeg = 58; // slight top-down, not hard isometric
  const rad = THREE.MathUtils.degToRad(camElevationDeg);
  camera.position.set(0, Math.sin(rad) * camDistance, Math.cos(rad) * camDistance);
  camera.lookAt(0, 0, 0);

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

  function start(): void {
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
  }

  return { scene, camera, renderer, sun, start, onResize };
}
