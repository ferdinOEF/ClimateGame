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
// STEP_PROMPT_mobile_responsive.md Section 2: converts a frame-to-frame
// two-finger distance delta (in CSS px) into the same `distance` units
// ZOOM_SPEED already governs for the wheel path — a different constant
// because a pinch's pixel-delta scale has nothing to do with a wheel
// event's deltaY scale, not because pinch has its own separate zoom
// range (it reuses CAM_DISTANCE_MIN/MAX below, unchanged). PLACEHOLDER,
// same "flag it, tune by feel" convention as every other pacing number
// in this codebase.
const PINCH_ZOOM_SPEED = 0.045;

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

  // preserveDrawingBuffer: readPixels-based readability verification
  // (tools/verify_readability.ts) needs the completed frame still present
  // in the default framebuffer when it reads it from outside the render
  // loop — without this the browser is free to clear/swap it away.
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
  sun.position.set(-8, 14, 6);
  scene.add(sun);

  const ambient = new THREE.HemisphereLight(PALETTE.sky.getHex(), 0x3a3a2a, 0.65);
  scene.add(ambient);

  // --- Pan (pointer drag) + zoom (wheel, or pinch on touch) -------------------

  let pointerDown: { x: number; y: number } | null = null;
  let didDrag = false;

  // STEP_PROMPT_mobile_responsive.md Section 2: tracks every currently-
  // down touch pointer by id (mouse/pen never enter this map — Pointer
  // Events give each simultaneous touch contact its own pointerId, which
  // is exactly what a two-finger gesture needs and a single `pointerDown`
  // anchor can't represent). `pinchLastDistance` is the previous frame's
  // inter-finger distance, not the gesture's starting distance — zoom
  // tracks the frame-to-frame delta, the same incremental model the wheel
  // handler already uses per scroll tick.
  const activeTouches = new Map<number, { x: number; y: number }>();
  let pinchLastDistance: number | null = null;

  function touchPairDistance(): number {
    const pts = [...activeTouches.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  renderer.domElement.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size === 2) {
        // A second finger touching down mid-pan hands off to pinch mode
        // cleanly: drop the pan anchor so the existing single-pointer
        // move logic can't also fire and cause a jump, and treat this
        // moment as definitely not a tap — a two-finger touch (even one
        // that never moves) is never a valid single-tile selection.
        pointerDown = null;
        didDrag = true;
        pinchLastDistance = touchPairDistance();
        return;
      }
      if (activeTouches.size > 2) return; // a third+ finger is ignored entirely
    }
    if (e.button !== 0) return;
    pointerDown = { x: e.clientX, y: e.clientY };
    didDrag = false;
  });

  window.addEventListener("pointermove", (e: PointerEvent) => {
    if (e.pointerType === "touch" && activeTouches.has(e.pointerId)) {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size === 2 && pinchLastDistance !== null) {
        const dist = touchPairDistance();
        // Fingers spreading apart (dist growing) should zoom in, i.e.
        // shrink `distance` — the same sign convention the wheel handler
        // uses (scrolling up/deltaY<0 also shrinks distance).
        distance = THREE.MathUtils.clamp(distance - (dist - pinchLastDistance) * PINCH_ZOOM_SPEED, CAM_DISTANCE_MIN, CAM_DISTANCE_MAX);
        updateTransform();
        pinchLastDistance = dist;
        return;
      }
    }

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

  function endTouch(e: PointerEvent): void {
    if (e.pointerType !== "touch") return;
    activeTouches.delete(e.pointerId);
    // Lifting one finger of a pinch back to one doesn't resume panning —
    // simpler and sufficient for this pass, per the step prompt's own
    // allowance not to over-build gesture continuity nothing asked for.
    // A fresh single-finger press starts a new pan normally.
    if (activeTouches.size < 2) pinchLastDistance = null;
  }
  window.addEventListener("pointerup", (e: PointerEvent) => {
    endTouch(e);
    pointerDown = null;
  });
  window.addEventListener("pointercancel", (e: PointerEvent) => {
    endTouch(e);
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
