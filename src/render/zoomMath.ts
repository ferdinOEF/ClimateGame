/**
 * Section 22.3 (owner request): zoom by ratio, not by a fixed distance. One
 * wheel notch (or one + / - press) moves the camera about 15% nearer or
 * further, so a zoom feels the same at every distance and far to near is a
 * dozen notches from the opening view. Pure: no DOM, no renderer.
 */

/** The share of the camera's distance one notch moves it. */
export const ZOOM_STEP = 0.15;

/** CSS pixels one wheel notch reports in pixel mode (Chrome, Edge, Safari: 100; trackpads report less, smoothly). */
const PX_PER_NOTCH = 100;

/**
 * A wheel event's travel in notches, whatever unit the browser reports it in
 * (`deltaMode` 0 pixels, 1 lines, 2 pages): Firefox reports 3 lines a notch.
 * Positive is away (zoom out).
 */
export function wheelNotches(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY / 3;
  if (deltaMode === 2) return deltaY;
  return deltaY / PX_PER_NOTCH;
}

/** The camera's distance after `notches` notches (positive: further), held inside [min, max]. */
export function zoomedDistance(distance: number, notches: number, min: number, max: number): number {
  const next = distance * Math.pow(1 + ZOOM_STEP, notches);
  return Math.min(max, Math.max(min, next));
}

/** Notches from `far` to `near` (whole notches, the last one stopping at the limit). */
export function notchesBetween(far: number, near: number): number {
  return Math.ceil(Math.log(far / near) / Math.log(1 + ZOOM_STEP) - 1e-9);
}

/**
 * Where the camera should look after a zoom so the ground point under the
 * pointer stays under it: with a fixed angle, the point under a pixel lies at
 * target + distance × a vector that depends only on the pixel, so the target
 * moves along that vector by the change in distance.
 */
export function zoomTowardTarget(target: { x: number; z: number }, pointer: { x: number; z: number }, distance: number, nextDistance: number): { x: number; z: number } {
  if (distance <= 0) return target;
  const k = nextDistance / distance;
  return { x: pointer.x - (pointer.x - target.x) * k, z: pointer.z - (pointer.z - target.z) * k };
}
