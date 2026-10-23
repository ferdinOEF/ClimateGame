/**
 * Wildlife: calm-year ambience on the board — a common kingfisher and an
 * egret from mangrove tiles, a smooth-coated otter in the mangrove water,
 * small fish and prawns jumping in the khazan ponds. Ambience only: no
 * text, no labels, no claims.
 *
 * USAGE (the integrator)
 *
 *   import { WildlifeDirector } from "@render/wildlife";
 *
 *   const wildlife = new WildlifeDirector({
 *     scene, camera,
 *     viewport: () => ({ width: canvas.clientWidth, height: canvas.clientHeight }),
 *     // Canvas-relative CSS-pixel rects the birds must never fly over:
 *     // Maya, the HUD panels, any open card. Called every frame while a bird flies.
 *     avoidRects: () => [...],
 *   });
 *   wildlife.setSources({
 *     mangroves:   [{ x, y, z }],            // tile centre (x, z); y = water surface there
 *     khazanPonds: [{ x, y, z, radius }],    // centre + radius of the POND (blue) half only
 *   });
 *   wildlife.setEnabled(quality !== "low" && !reducedMotion);
 *   wildlife.setCalm(!stormActive && !resultCardOpen);
 *   // every frame:
 *   wildlife.tick(performance.now());
 *   // on teardown:
 *   wildlife.dispose();
 *
 * - At most one moment at a time, the next one 6–10 s after the last ended,
 *   picked at random among the kinds whose sources are on screen (and not
 *   under an avoid rect).
 * - setCalm(false): birds out are flushed (a short burst up and away, or a
 *   burst from an on-screen mangrove if none was out), the otter dives, and
 *   nothing new starts until setCalm(true).
 * - setEnabled(false) hides everything at once.
 * - Section 30.5: the mangroves' birds run on their own clock. birdFrom(point) on planting sends a kingfisher
 *   or an egret (taking turns) up out of that mangrove toward the screen as soon as the board is calm; then each
 *   mangrove on screen sends one every 20-30 s, one bird at a time. A fly-in never looks smaller than a floor
 *   fraction of the screen height, so it reads at the opening zoom. setLite(true) (Low quality) keeps only the birds.
 *   flyIns logs each one with its largest on-screen radius and its time at 40 px or more.
 * - forceMoment(kind, sourceIndex?) starts a moment now (for QA shots).
 * - triangleCounts reports the triangles of each model.
 *
 * Everything is created once in the constructor; tick() allocates nothing.
 * Pure Three.js: the only screen knowledge comes from `camera` and
 * `viewport()`.
 */
export {
  WildlifeDirector,
  type WildlifeKind,
  type WildlifeOptions,
  type WildlifePoint,
  type WildlifeSources,
  type ScreenRect
} from "./wildlifeDirector";
export { KingfisherModel } from "./kingfisherModel";
export { EgretModel } from "./egretModel";
export { OtterModel } from "./otterModel";
