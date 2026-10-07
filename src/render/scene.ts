import * as THREE from "three";
import { PALETTE } from "./palette";

export interface KhazanScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  start: (onFrame?: (nowMs: number) => void) => void;
  onResize: () => void;
  /**
   * Re-centres the camera on a world (x, z) point, keeping the same distance
   * and elevation. Each map carries its own focus point, chosen to put sea,
   * sand, river and town in one frame — a map's (0, 0) is wherever its grid
   * happened to centre, which on a georeferenced map is a latitude and
   * longitude rather than anywhere worth looking at.
   *
   * Glides by default, which is what makes "look over there" read as a move
   * rather than a cut. `immediate` snaps, and the session uses it for the
   * opening frame: easing in from wherever the camera happened to be
   * initialised would look like a mistake, not an establishing shot.
   */
  focusOn: (x: number, z: number, immediate?: boolean) => void;
  /**
   * Pulls back far enough to hold a board of the given world-space size.
   *
   * The campaign used to play on one map, so a single hand-picked opening
   * distance was fine. It is not fine now: the boards run from a 63-tile
   * teaching diagram to 357 tiles of the Canacona coast, and the distance
   * that framed the old map shows about a tenth of Panaji — which defeats the
   * entire point of having drawn Panaji.
   *
   * Re-applied on resize, so rotating a phone reframes the board instead of
   * cropping it. That stops the moment the player zooms: once someone has
   * chosen their own framing, a resize must not throw it away.
   */
  fitTo: (worldWidth: number, worldDepth: number, immediate?: boolean) => void;
  /** Offsets the camera by a small amount without moving what it looks at — the storm's impact tremor. Pass (0, 0) to clear. */
  setShake: (x: number, z: number) => void;
  /** Where the camera is currently looking, so effects anchored to the view (the rain volume) can follow it. */
  focusPoint: () => { x: number; z: number };
  /** How far back the camera is sitting, in world units. Lets view-dependent UI — the place labels — know how zoomed in the player is. */
  cameraDistance: () => number;
  /** True if the pointer moved more than a few px between its last down/up — a pan, not a click. Callers should skip click actions when this is true. */
  wasDrag: () => boolean;
  /** Per-frame cost counters, read by the performance reports (see `start`). */
  frameStats: { frames: number; updateMs: number; renderMs: number; calls: number; triangles: number };
  /**
   * Tears the scene down completely: stops the render loop, detaches every
   * listener (including the ones on `window`, which outlive the canvas and
   * are the ones that actually leak), drops GPU resources and removes the
   * canvas from the DOM.
   *
   * Needed now that the app starts and stops a scene per level rather than
   * building one at boot and keeping it forever. Without it, every level
   * transition would leave behind a live animation loop, a WebGL context
   * (browsers cap those at ~16 before dropping the oldest) and a set of
   * window listeners still panning a camera nothing renders.
   */
  dispose: () => void;
}

const CAM_DISTANCE_DEFAULT = 18;
const CAM_DISTANCE_MIN = 8;
/**
 * How far the player can pull back. Raised from 40 for the real-world maps,
 * then from 58 when Panaji grew to reach Merces: at 90 the whole 61-by-55-unit
 * board fits on a landscape screen with room to spare, so the zoom-out control
 * always ends with the entire map in view.
 */
const CAM_DISTANCE_MAX = 90;
/**
 * The furthest the camera is placed when it frames a board for you — on
 * opening a level, and on a resize before you have zoomed.
 *
 * Separate from `CAM_DISTANCE_MAX`, which is how far you may pull back
 * yourself. They were the same number (58) while every board fitted on screen
 * at it. Panaji, running from Miramar to Merces, is about 61 by 55 units: a
 * frame that held all of it would open the level on a map too small to read,
 * and capping the manual zoom there would mean never seeing the whole city at
 * once. So the game opens at a readable distance on the map's focus point, and
 * lets the player pull back until all of it is in view.
 */
const CAM_DISTANCE_OPENING_MAX = 44;
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
 * Fraction of the remaining distance the camera closes per 60 Hz frame.
 *
 * 0.18 settles a move in roughly a fifth of a second: fast enough that a pan
 * still feels like dragging the world directly rather than towing it, slow
 * enough to turn a wheel notch into a glide. Frame-rate compensated in
 * `settleCamera`, so this number means the same thing at 60 and 144 Hz.
 */
const CAM_SMOOTHING = 0.18;

/**
 * Dorfromantik-style camera: a slight top-down perspective, pan/zoom only,
 * no free orbit (Section 6). Bucket A (NEXT_STEPS.md): the camera used to
 * be framed once at boot and never move again — this adds pointer-drag pan
 * and scroll-wheel zoom, the only two camera controls this pilot needs.
 * One directional sun, no fog, no multi-light rig.
 */
export function createScene(container: HTMLElement): KhazanScene {
  // Every listener below is registered with this signal, so `dispose()`
  // removes all of them in one call and cannot miss one as handlers are
  // added over time.
  const listenerAbort = new AbortController();
  const { signal } = listenerAbort;

  const scene = new THREE.Scene();
  // Cloned, not assigned. `PALETTE.sky` is a shared module-level Color, and
  // the storm tints the sky by mutating this one — assigning the shared
  // object directly would darken the palette itself, permanently, for every
  // later scene and every other consumer of that colour.
  scene.background = PALETTE.sky.clone();
  // No fog. A distance haze used to sit over the board and thicken as the
  // camera pulled back, which at full zoom-out washed the far half of the map
  // into a pale sheet — and on these boards the far half is real coastline
  // the player is meant to read. The whole map now stays crisp at every zoom.

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 200);
  const rad = THREE.MathUtils.degToRad(CAM_ELEVATION_DEG);

  /**
   * The camera runs on a desired value and a displayed value, with the
   * displayed one chasing the desired one every frame.
   *
   * Before this, a wheel tick snapped `distance` and re-derived the matrix
   * inside the event handler. That is correct and it feels bad: a mouse wheel
   * delivers discrete notches, so zooming read as a series of jumps rather
   * than a movement, and a pinch delivered them fast enough to stutter. Pan
   * had the same problem in milder form, because a pointermove at 60 Hz on a
   * 120 Hz display moves the camera on half the frames.
   *
   * Splitting the two fixes both with one mechanism, and gives `focusOn`
   * a glide for free.
   */
  let target = { x: 0, z: 0 };
  let desiredTarget = { x: 0, z: 0 };
  let distance = CAM_DISTANCE_DEFAULT;
  let desiredDistance = CAM_DISTANCE_DEFAULT;

  // The camera never yaws (Section 6: no rotation), so its ground-plane
  // right/forward axes are always world +X / -Z regardless of target —
  // panning is just a direct offset in those two constant directions.
  /**
   * A small positional tremor added on top of the camera's resting place,
   * driven by the storm at the moment of impact. Kept separate from `target`
   * so it never contaminates where the camera is actually looking — a shake
   * folded into the pan target would drift the view a little further every
   * frame it ran.
   */
  let shakeX = 0;
  let shakeZ = 0;

  function updateTransform(): void {
    camera.position.set(
      target.x + shakeX,
      Math.sin(rad) * distance,
      target.z + shakeZ + Math.cos(rad) * distance
    );
    camera.lookAt(target.x, 0, target.z);
  }

  function setShake(x: number, z: number): void {
    if (x === shakeX && z === shakeZ) return;
    shakeX = x;
    shakeZ = z;
    // Applied immediately rather than waiting for `settleCamera`, which stops
    // recomputing the matrix once the camera has come to rest — exactly the
    // state a shake needs to move it out of.
    updateTransform();
  }

  /**
   * Moves the displayed camera toward the desired one. Returns true while
   * there is still ground to cover, so the render loop only recomputes the
   * matrix when something is actually moving.
   *
   * The smoothing is frame-rate compensated: a fixed per-frame lerp factor
   * would make the camera glide at one speed on a 60 Hz display and nearly
   * twice that on a 120 Hz one. Raising the retention factor to the power of
   * (dt / reference frame) keeps the time constant the same on both.
   */
  function settleCamera(deltaMs: number): boolean {
    const dx = desiredTarget.x - target.x;
    const dz = desiredTarget.z - target.z;
    const dd = desiredDistance - distance;

    // Below this, the remaining error is far under a pixel at any zoom level.
    // Snapping instead of easing forever is what stops the camera recomputing
    // its matrix on every frame for the rest of the session.
    if (Math.abs(dx) < 0.0005 && Math.abs(dz) < 0.0005 && Math.abs(dd) < 0.0005) {
      if (dx !== 0 || dz !== 0 || dd !== 0) {
        target = { x: desiredTarget.x, z: desiredTarget.z };
        distance = desiredDistance;
        updateTransform();
      }
      return false;
    }

    const step = 1 - Math.pow(1 - CAM_SMOOTHING, Math.min(4, deltaMs / 16.667));
    target = { x: target.x + dx * step, z: target.z + dz * step };
    distance += dd * step;
    updateTransform();
    return true;
  }

  function focusOn(x: number, z: number, immediate = false): void {
    desiredTarget = { x, z };
    if (immediate) {
      target = { x, z };
      updateTransform();
    }
  }
  focusOn(0, 0, true);

  /**
   * The board this camera was asked to frame, kept so a resize can reframe it.
   * Null until `fitTo` is called.
   */
  let fitBounds: { width: number; depth: number } | null = null;
  /**
   * Set the first time the player zooms. After that a resize leaves the zoom
   * alone: someone who has chosen their own framing should keep it when they
   * rotate their phone, not have the game overrule them.
   */
  let userAdjustedZoom = false;

  /**
   * How far back the camera has to sit to hold a board of this size.
   *
   * Two constraints, and the binding one wins:
   *
   *   - Width. The horizontal field of view is derived from the vertical one
   *     and the current aspect, so this answer changes with the window shape,
   *     which is exactly why the result is recomputed on resize.
   *   - Depth. The camera looks down at `CAM_ELEVATION_DEG`, so a given
   *     vertical angle covers MORE ground than it would head-on — foreshortened
   *     by sin(elevation). Leaving that term out makes the opening frame of
   *     every tall map about 15% too tight, with the bottom row cut off.
   */
  function distanceToFit(worldWidth: number, worldDepth: number): number {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);

    const forWidth = worldWidth / (2 * Math.tan(horizontalFov / 2));
    const forDepth = (worldDepth * Math.sin(rad)) / (2 * Math.tan(verticalFov / 2));

    // Breathing room, so the outermost tiles are neither flush against the
    // screen edge nor underneath the HUD's corner panels — which occupy real
    // estate at all four corners and would otherwise cover the board's own
    // corners exactly.
    return THREE.MathUtils.clamp(Math.max(forWidth, forDepth) * 1.18, CAM_DISTANCE_MIN, CAM_DISTANCE_OPENING_MAX);
  }

  function fitTo(worldWidth: number, worldDepth: number, immediate = false): void {
    fitBounds = { width: worldWidth, depth: worldDepth };
    desiredDistance = distanceToFit(worldWidth, worldDepth);
    if (immediate) {
      distance = desiredDistance;
      updateTransform();
    }
  }

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
    // Grabbing the board cancels any glide in progress (Maya's camera focus,
    // a staged storm's move): the player's hand always wins over the script.
    desiredTarget = { x: target.x, z: target.z };
  }, { signal });

  window.addEventListener("pointermove", (e: PointerEvent) => {
    if (e.pointerType === "touch" && activeTouches.has(e.pointerId)) {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size === 2 && pinchLastDistance !== null) {
        const dist = touchPairDistance();
        // Fingers spreading apart (dist growing) should zoom in, i.e.
        // shrink `distance` — the same sign convention the wheel handler
        // uses (scrolling up/deltaY<0 also shrinks distance).
        desiredDistance = THREE.MathUtils.clamp(
          desiredDistance - (dist - pinchLastDistance) * PINCH_ZOOM_SPEED,
          CAM_DISTANCE_MIN,
          CAM_DISTANCE_MAX
        );
        userAdjustedZoom = true;
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
    // Measured against `desiredDistance`, not the displayed one: mid-glide
    // the two differ, and using the displayed value would make a drag that
    // overlaps a zoom travel the wrong amount.
    const panScale = desiredDistance / Math.max(1, container.clientHeight);
    desiredTarget = { x: desiredTarget.x - dx * panScale, z: desiredTarget.z - dy * panScale };
    pointerDown = { x: e.clientX, y: e.clientY };
  }, { signal });

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
  }, { signal });
  window.addEventListener("pointercancel", (e: PointerEvent) => {
    endTouch(e);
    pointerDown = null;
  }, { signal });

  renderer.domElement.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      desiredDistance = THREE.MathUtils.clamp(
        desiredDistance + e.deltaY * ZOOM_SPEED,
        CAM_DISTANCE_MIN,
        CAM_DISTANCE_MAX
      );
      userAdjustedZoom = true;
    },
    { passive: false, signal }
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

    // The distance that framed the board in landscape crops it in portrait,
    // because the horizontal field of view is derived from the aspect. Only
    // reframes while the player has left the zoom alone — see
    // `userAdjustedZoom`.
    if (fitBounds && !userAdjustedZoom) {
      desiredDistance = distanceToFit(fitBounds.width, fitBounds.depth);
    }
  }
  window.addEventListener("resize", onResize, { signal });

  /**
   * Running totals for the performance reports in tools/phaseShots.ts: CPU
   * time spent in the per-frame update and in `renderer.render` (which, on a
   * real GPU, is mostly command submission), plus the last frame's draw calls
   * and triangles. Software GL makes frames per second meaningless in CI;
   * these numbers are what changes when the scene gets heavier.
   */
  const frameStats = { frames: 0, updateMs: 0, renderMs: 0, calls: 0, triangles: 0 };

  function start(onFrame?: (nowMs: number) => void): void {
    let lastFrameMs: number | null = null;
    renderer.setAnimationLoop((nowMs: number) => {
      // Clamped so a backgrounded tab resuming after thirty seconds eases the
      // camera in over a few frames instead of teleporting it.
      const deltaMs = lastFrameMs === null ? 16.667 : Math.min(100, nowMs - lastFrameMs);
      lastFrameMs = nowMs;
      settleCamera(deltaMs);
      const cpuStart = performance.now();
      onFrame?.(nowMs);
      frameStats.updateMs += performance.now() - cpuStart;
      const renderStart = performance.now();
      renderer.render(scene, camera);
      frameStats.renderMs += performance.now() - renderStart;
      frameStats.frames++;
      frameStats.calls = renderer.info.render.calls;
      frameStats.triangles = renderer.info.render.triangles;
    });
  }

  function dispose(): void {
    // Order matters: stop the loop before releasing anything it renders,
    // so a frame already in flight cannot touch a disposed resource.
    renderer.setAnimationLoop(null);
    listenerAbort.abort();

    // Three does not free GPU memory when a mesh leaves the graph — the
    // geometry and material hold buffers until told otherwise. Walk what
    // is still attached and release it, rather than trusting GC.
    scene.traverse((object) => {
      const mesh = object as Partial<THREE.Mesh>;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    scene.clear();

    // Drops the WebGL context itself. Browsers allow only a handful of
    // live contexts per page and silently kill the oldest past the cap,
    // so a per-level scene must hand its own back.
    renderer.dispose();
    renderer.domElement.remove();
  }

  function focusPoint(): { x: number; z: number } {
    return { x: target.x, z: target.z };
  }

  function cameraDistance(): number {
    return distance;
  }

  return {
    scene,
    camera,
    renderer,
    sun,
    start,
    onResize,
    focusOn,
    fitTo,
    frameStats,
    setShake,
    focusPoint,
    cameraDistance,
    wasDrag,
    dispose
  };
}
