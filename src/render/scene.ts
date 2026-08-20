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
  /** True if the pointer moved more than a few px between its last down/up — a pan, not a click. Callers should skip click actions when this is true. */
  wasDrag: () => boolean;
}

const CAM_DISTANCE_DEFAULT = 18;
const CAM_DISTANCE_MIN = 8;
const CAM_DISTANCE_MAX = 40;
const CAM_ELEVATION_DEG = 58; // slight top-down, not hard isometric
const DRAG_THRESHOLD_PX = 5;
const ZOOM_SPEED = 0.02;

/**
 * Dorfromantik-style camera: a slight top-down perspective, pan/zoom only,
 * no free orbit (Section 6). Bucket A (NEXT_STEPS.md): the camera used to
 * be framed once at boot and never move again — this adds pointer-drag pan
 * and scroll-wheel zoom, the only two camera controls this pilot needs.
 * One directional sun + soft fog for depth, no multi-light rig.
 */
export function createScene(container: HTMLElement): KhazanScene {
  const scene = new THREE.Scene();
  scene.background = PALETTE.sky;
  scene.fog = new THREE.Fog(PALETTE.fog.getHex(), 18, 46);

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 200);
  const rad = THREE.MathUtils.degToRad(CAM_ELEVATION_DEG);

  let target = { x: 0, z: 0 };
  let distance = CAM_DISTANCE_DEFAULT;

  // The camera never yaws (Section 6: no rotation), so its ground-plane
  // right/forward axes are always world +X / -Z regardless of target —
  // panning is just a direct offset in those two constant directions.
  function updateTransform(): void {
    camera.position.set(target.x, Math.sin(rad) * distance, target.z + Math.cos(rad) * distance);
    camera.lookAt(target.x, 0, target.z);
  }

  function focusOn(x: number, z: number): void {
    target = { x, z };
    updateTransform();
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

  // --- Pan (pointer drag) + zoom (wheel) --------------------------------------

  let pointerDown: { x: number; y: number } | null = null;
  let didDrag = false;

  renderer.domElement.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return;
    pointerDown = { x: e.clientX, y: e.clientY };
    didDrag = false;
  });

  window.addEventListener("pointermove", (e: PointerEvent) => {
    if (!pointerDown || e.buttons !== 1) return;
    const dx = e.clientX - pointerDown.x;
    const dy = e.clientY - pointerDown.y;
    if (!didDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    didDrag = true;

    // Pan speed scales with distance (and viewport height) so a given drag
    // covers the same *apparent* screen distance regardless of zoom level.
    const panScale = distance / Math.max(1, container.clientHeight);
    target = { x: target.x - dx * panScale, z: target.z - dy * panScale };
    updateTransform();
    pointerDown = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("pointerup", () => {
    pointerDown = null;
  });

  renderer.domElement.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      distance = THREE.MathUtils.clamp(distance + e.deltaY * ZOOM_SPEED, CAM_DISTANCE_MIN, CAM_DISTANCE_MAX);
      updateTransform();
    },
    { passive: false }
  );

  function wasDrag(): boolean {
    return didDrag;
  }

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

  return { scene, camera, renderer, sun, start, onResize, focusOn, wasDrag };
}
