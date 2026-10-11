import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialKey, axialToWorld, neighbors } from "@core/hex";
import { RELIEF, contoursBetween, reliefLift } from "@core/relief";
import { TERRAIN_DEFS, TERRAIN_BY_ID } from "@core/terrain";
import { createHexPrismGeometry } from "./hexGeometry";
import { jitterColor, jitterGrass, paletteColor } from "./palette";
import { SettleAnimator } from "./settleAnimation";
import { MAX_TERRAIN_INSTANCES_PER_TYPE } from "./instanceLimits";
import { OVERLAY_PLACEHOLDER, patchForOverlay, type OverlayUniforms } from "./mapOverlayShader";

export const HEX_SIZE = 1.0;
const UNCLAIMED_SINK = 0.15; // unclaimed tiles sit slightly lower, like they're still in the fog
// Three playtest passes on this function now. First, the original
// per-terrain HSL desaturate (scale saturation down, nudge lightness toward
// mid-gray) read fine tile-by-tile but not at a glance: two terrain types
// with very different base lightness (sun-bleached sand vs. deep forest)
// still read as clearly different colors even dimmed, so "is this claimed?"
// wasn't legible across a mixed-terrain map. The fix for that — blending
// *hard* toward one shared neutral fog tone — overshot in the opposite
// direction: unclaimed tiles converged on one flat, near-indistinguishable
// tan regardless of terrain. Worse, `STEP_PROMPT_visuals_map_river.md` item
// 1 measured the ACTUAL rendered luminance (screenshot -> grayscale ->
// sample) and found that "blend toward fog" approach doesn't even reliably
// solve the original problem it was written for: for an already-light
// terrain like Beach, `fog` (itself a bright, near-white tone) is barely
// darker than the terrain's own full color, so claimed-vs-unclaimed Beach
// came out ONE point of luminance apart — invisible in grayscale, and a
// real accessibility failure for color-vision-deficient players, not just
// a subjective "looks kinda samey" complaint.
//
// The actual fix has to guarantee a real luminance gap structurally,
// regardless of how light or dark a given terrain's full color happens to
// be — blending toward a fixed *lighter* reference color can never do that
// for terrains already close to that reference. A flat HSL-lightness
// *subtraction* (an earlier version of this function, see git history)
// turned out to have the same class of problem one level down: THREE.js's
// `Color.getHSL()` runs in a color-managed working space, not naive sRGB
// hex math, so a hand-picked absolute lightness target doesn't mean what
// it looks like on paper — mangroveTeal's actual `l` there measures
// ~0.06, *below* a flat-subtraction version's own "floor" meant to
// protect already-dark colors from crushing to black, which made that
// floor clamp mangrove's unclaimed state *brighter* than its claimed
// state instead of darker. A *proportional* (multiplicative) lightness
// cut sidesteps the whole class of bug: multiplying any positive `l` by a
// fixed factor < 1 always reduces it and never needs a separate floor,
// regardless of which color space or absolute range `l` actually lives
// in. Verified against `tools/verify_readability.ts`, which reads real
// rendered pixels off the live WebGL canvas rather than trusting this
// math on paper — see that script for the actual measured deltas.
const UNCLAIMED_SATURATION_SCALE = 0.62; // how much of the terrain's own saturation survives — still reads "muted," not grayscale
const UNCLAIMED_LIGHTNESS_FACTOR = 0.3; // unclaimed lightness = claimed lightness * this — the real source of the claimed/unclaimed gap

interface TerrainInstance {
  coord: AxialCoord;
  index: number;
  terrainId: string;
  fullColor: THREE.Color;
  dimColor: THREE.Color;
  claimed: boolean;
  /** World position, cached so the swell does not re-derive it from the axial coord every frame. */
  x: number;
  z: number;
  /** How far real ground height lifts this tile's top (land on a DEM-built map; 0 elsewhere). */
  lift: number;
  /** This tile's offset into the swell cycle, in radians. Absent on land. */
  swellPhase?: number;
}

function dim(color: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return color.clone().setHSL(hsl.h, hsl.s * UNCLAIMED_SATURATION_SCALE, hsl.l * UNCLAIMED_LIGHTNESS_FACTOR);
}

/**
 * Which terrain types move, and how much.
 *
 * Water tiles were as static as the land, which is the single thing that most
 * made a board of a hundred tiles read as a diagram rather than a coast. Half
 * of some of these maps is open sea — on Palolem it is over a third of the
 * board — and a third of the screen holding perfectly still is a lot of
 * stillness to look at.
 *
 * The fix is a slow swell: each water tile rises and falls a few centimetres
 * and brightens very slightly, with its phase offset by position so the
 * motion travels across the map as a wave rather than pulsing in unison. Open
 * sea gets the largest amplitude, the river less (a channel is calmer than
 * open water), the estuary least of all — a mangrove shallow is the stillest
 * water on this coast, and that is worth saying visually.
 *
 * Deliberately small numbers. The job is to stop the sea looking painted on,
 * not to animate surf; anything large enough to notice as movement would also
 * be large enough to compete with the hazard overlays, which is where the
 * player's attention genuinely needs to go.
 */
interface SwellProfile {
  /** World-space vertical travel, peak to trough. */
  amplitudeY: number;
  /** Lightness added at the crest, as a fraction of the tile's own lightness. */
  lightnessGain: number;
  /** Seconds for one full cycle. */
  periodSeconds: number;
}

const SWELL_BY_TERRAIN: Record<string, SwellProfile> = {
  coast: { amplitudeY: 0.045, lightnessGain: 0.1, periodSeconds: 4.2 },
  river: { amplitudeY: 0.022, lightnessGain: 0.06, periodSeconds: 5.6 },
  estuary: { amplitudeY: 0.014, lightnessGain: 0.045, periodSeconds: 7.1 }
};

/**
 * How far the swell's phase advances per world unit travelled.
 *
 * This is what turns a field of independently bobbing tiles into a wave with
 * a direction. The two components differ so the crest lines run diagonally
 * across the board rather than square to it — a swell parallel to the tile
 * rows would read as the grid animating, not as water.
 */
const SWELL_PHASE_PER_X = 0.42;

/**
 * Land on a relief map is drawn edge to edge (no gap) and in one even green,
 * so the land reads as one surface rather than a patchwork of hexes. The
 * step sides of a rise still show, because they face the light differently.
 * A higher tile is a little paler and drier: the second cue, after the
 * steps, that the ground climbs.
 */
const RELIEF_LAND_RADIUS = HEX_SIZE * 1.0;
/**
 * The land prism for a relief map: full size, with its step sides shaded
 * darker than its top (vertex colours, multiplied by the instance colour).
 * Flat shading alone left a raised tile's sides almost as bright as its top
 * under the high sun, and the steps up Altinho barely showed.
 */
function reliefLandGeometry(height: number): THREE.BufferGeometry {
  const geometry = createHexPrismGeometry(RELIEF_LAND_RADIUS, height).toNonIndexed();
  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const shade = normals.getY(i) > 0.5 ? 1 : RELIEF.sideShade;
    colors.set([shade, shade, shade], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const HIGH_GROUND_TINT = new THREE.Color("#c9c48f");
const HIGH_GROUND_MAX_BLEND = 0.32;
const SWELL_PHASE_PER_Z = 0.27;

/** The crest tint target. Shared constant so the swell allocates nothing per frame. */
const WHITE = new THREE.Color(0xffffff);

/**
 * Whether the player has asked their system for reduced motion.
 *
 * Wrapped rather than called inline so the manager can be constructed in a
 * test environment with no `matchMedia`, which jsdom-less vitest runs are.
 * Defaults to "no preference expressed" on failure, matching what a browser
 * reports when the user has not set one.
 */
function matchMediaReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * How strongly the map layer shows on each terrain, as a multiple of the
 * player's opacity setting.
 *
 * The map is for reading the city: streets, names, neighbourhoods. That is
 * all on land, so on land the tile's own flat green recedes almost entirely
 * (at the default 75% it is about 94% map). Water, sand and wetland are the
 * opposite: they are what the game is about, and the player has to see at a
 * glance where the beach and the mangrove ground are. On those the tile keeps
 * its own colour and the map is a light wash (about 20–26%), enough to show
 * the creek outlines and the shore without muddying which is which.
 */
const OVERLAY_STRENGTH: Record<string, number> = {
  land: 1.25,
  beach: 0.3,
  estuary: 0.35,
  river: 0.3,
  coast: 0.27
};

/**
 * v2.1: the terrain map is fixed (Section 4) — `loadMap` renders the whole
 * authored map at boot, unclaimed tiles dimmed and slightly sunken.
 * `claimTile` reveals one in place (rise + brighten), reusing the same
 * settle-animation feel the old player-drawn tiles had.
 */
export class TerrainMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();
  private placed = new Map<string, TerrainInstance>();
  private animator = new SettleAnimator();
  /** Water tiles only, in one flat list — see the note in `loadMap`. */
  private swellTiles: TerrainInstance[] = [];
  /**
   * Set while the swell is running. Turned off for a player who has asked
   * their system for reduced motion: this is decorative movement over a third
   * of the screen, which is exactly what that preference is about.
   *
   * Read once at construction rather than watched. A player changing the
   * setting mid-run gets the new behaviour on their next level, which is a
   * fair trade for not holding a media-query listener per session.
   */
  private readonly swellEnabled = !matchMediaReducedMotion();
  /** Scratch objects, reused every frame — allocating a Matrix4 and a Color per water tile per frame would be ~8000 objects a second on a large map. */
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchColor = new THREE.Color();
  /** Shared by every terrain material, and by the board skirt — see `patchForOverlay`. */
  private readonly overlay: OverlayUniforms = {
    uOsmMap: { value: OVERLAY_PLACEHOLDER },
    uOsmRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uOsmOpacity: { value: 0 }
  };
  /** False until `setOverlayTexture`; opacity stays 0 before then so the placeholder never shows. */
  private overlayReady = false;
  private overlayOpacity = 0;

  /** Faint contour lines along the edges where the ground crosses a contour (see `buildContours`). */
  private contours: THREE.Mesh | null = null;

  constructor() {
    for (const terrain of TERRAIN_DEFS) {
      const geometry = createHexPrismGeometry(HEX_SIZE * 0.98, terrain.height);
      // Per-instance tint comes from InstancedMesh.instanceColor, which the
      // renderer picks up automatically — vertexColors is for a per-vertex
      // `color` geometry attribute we don't have, and would otherwise force
      // the shader to multiply against a missing (black) attribute.
      const material = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.9,
        metalness: 0.0
      });
      patchForOverlay(material, this.overlay, OVERLAY_STRENGTH[terrain.id] ?? 0.5);
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_TERRAIN_INSTANCES_PER_TYPE);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TERRAIN_INSTANCES_PER_TYPE * 3), 3);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = `terrain-${terrain.id}`;
      this.meshes.set(terrain.id, mesh);
      this.counts.set(terrain.id, 0);
      this.group.add(mesh);
    }
  }

  /** The map layer's shared uniforms, so decorative meshes around the board can show it too. */
  get overlayUniforms(): OverlayUniforms {
    return this.overlay;
  }

  /** Hands the loaded map layer to the shader, and the world rectangle it covers. */
  setOverlayTexture(texture: THREE.Texture, rect: { x: number; z: number; width: number; depth: number }): void {
    this.overlay.uOsmMap.value = texture;
    this.overlay.uOsmRect.value.set(rect.x, rect.z, rect.width, rect.depth);
    this.overlayReady = true;
    this.overlay.uOsmOpacity.value = this.overlayOpacity;
  }

  /** 0 hides the layer, 1 shows only the map. Remembered until the texture arrives. */
  setOverlayOpacity(opacity: number): void {
    this.overlayOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    this.overlay.uOsmOpacity.value = this.overlayReady ? this.overlayOpacity : 0;
  }

  height(terrainId: string): number {
    return TERRAIN_BY_ID.get(terrainId)?.height ?? 0.5;
  }

  hasTile(coord: AxialCoord): boolean {
    return this.placed.has(`${coord.q},${coord.r}`);
  }

  /**
   * A tile's resting transform: on its spot, sunk if unclaimed, and stretched
   * upward by its relief lift. The prism's base stays put, so a raised tile
   * grows a taller side rather than floating.
   */
  private restMatrix(inst: TerrainInstance, target: THREE.Matrix4, yOffset = 0): THREE.Matrix4 {
    const base = inst.claimed ? 0 : -UNCLAIMED_SINK;
    const height = this.height(inst.terrainId);
    return target.makeScale(1, (height + inst.lift) / height, 1).setPosition(inst.x, base + yOffset, inst.z);
  }

  /** Renders the entire fixed map at once, every tile dimmed/sunken (unclaimed) except `claimedCoords`. */
  loadMap(mapTiles: { coord: AxialCoord; terrainId: string; elevationM?: number }[], claimedCoords: Iterable<AxialCoord>): void {
    const claimedKeys = new Set(Array.from(claimedCoords, (c) => `${c.q},${c.r}`));
    // A map with real ground heights draws its land as one surface (see RELIEF_LAND_RADIUS).
    const relief = mapTiles.some((tile) => tile.elevationM !== undefined);
    if (relief) {
      const land = this.meshes.get("land");
      if (land) {
        land.geometry.dispose();
        land.geometry = reliefLandGeometry(this.height("land"));
        (land.material as THREE.MeshStandardMaterial).vertexColors = true;
        (land.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }
    }
    const highest = Math.max(1, ...mapTiles.map((tile) => tile.elevationM ?? 0));

    for (const { coord, terrainId, elevationM } of mapTiles) {
      const terrain = TERRAIN_BY_ID.get(terrainId);
      if (!terrain) throw new Error(`Unknown terrain id: ${terrainId}`);
      const mesh = this.meshes.get(terrainId)!;
      const index = this.counts.get(terrainId)!;
      if (index >= MAX_TERRAIN_INSTANCES_PER_TYPE) throw new Error(`Terrain instance cap exceeded for ${terrainId}`);

      const { x, z } = axialToWorld(coord, HEX_SIZE);
      const key = `${coord.q},${coord.r}`;
      const claimed = claimedKeys.has(key);
      const seed = coord.q * 31 + coord.r * 17;
      const lift = reliefLift(elevationM);
      const fullColor =
        terrainId === "land"
          ? relief
            ? paletteColor(terrain.colorKey).clone().lerp(HIGH_GROUND_TINT, Math.sqrt((elevationM ?? 0) / highest) * HIGH_GROUND_MAX_BLEND)
            : jitterGrass(paletteColor(terrain.colorKey), seed)
          : jitterColor(paletteColor(terrain.colorKey), seed);
      const dimColor = dim(fullColor);

      this.counts.set(terrainId, index + 1);
      mesh.count = index + 1;

      const inst: TerrainInstance = {
        coord,
        index,
        terrainId,
        fullColor,
        dimColor,
        claimed,
        x,
        z,
        lift,
        swellPhase: SWELL_BY_TERRAIN[terrainId] ? x * SWELL_PHASE_PER_X + z * SWELL_PHASE_PER_Z : undefined
      };
      this.placed.set(key, inst);
      mesh.setMatrixAt(index, this.restMatrix(inst, new THREE.Matrix4()));
      mesh.setColorAt(index, claimed ? fullColor : dimColor);
    }
    if (relief) this.buildContours(mapTiles);

    // One flat list of just the water tiles, built once here rather than
    // filtered out of `placed` on every frame. On the largest map that is 130
    // tiles to walk per frame instead of 357.
    this.swellTiles = Array.from(this.placed.values()).filter((inst) => inst.swellPhase !== undefined);

    // A dark floor under every tile, a little wider than the tile, so the
    // gaps between tiles read as shadow. Without it, the gaps that line up
    // with the camera showed the pale sky as thin bright lines (mistakable
    // for a road or a stream). One draw call, built once.
    if (mapTiles.length > 0) {
      const floorGeometry = new THREE.CylinderGeometry(HEX_SIZE * 1.02, HEX_SIZE * 1.02, 0.02, 6, 1, false);
      const floor = new THREE.InstancedMesh(floorGeometry, new THREE.MeshBasicMaterial({ color: "#22302a" }), mapTiles.length);
      floor.name = "terrain-floor";
      const m = new THREE.Matrix4();
      mapTiles.forEach(({ coord }, i) => {
        const { x, z } = axialToWorld(coord, HEX_SIZE);
        floor.setMatrixAt(i, m.makeTranslation(x, -UNCLAIMED_SINK - 0.06, z));
      });
      floor.instanceMatrix.needsUpdate = true;
      this.group.add(floor);
    }

    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /** Reveals a tile: rises to its resting height and brightens to full color, over ~SETTLE_DURATION_MS. */
  claimTile(coord: AxialCoord): void {
    const inst = this.placed.get(`${coord.q},${coord.r}`);
    if (!inst || inst.claimed) return;
    inst.claimed = true;

    const mesh = this.meshes.get(inst.terrainId)!;
    const { x, z } = axialToWorld(coord, HEX_SIZE);
    if (inst.lift > 0) {
      // The settle animation writes a plain translation, which would drop the relief stretch.
      mesh.setMatrixAt(inst.index, this.restMatrix(inst, new THREE.Matrix4()));
      mesh.instanceMatrix.needsUpdate = true;
    } else this.animator.begin(mesh, inst.index, x, z, 0, performance.now());
    mesh.setColorAt(inst.index, inst.fullColor);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /**
   * Overrides a tile's color (e.g. the flood telegraph darkening river
   * tiles), blending from whatever its current resting color is (dimmed if
   * still unclaimed, full if claimed). Pass `null` to restore that resting color.
   */
  setTint(coord: AxialCoord, tint: THREE.Color | null, blend = 0.6): void {
    const inst = this.placed.get(`${coord.q},${coord.r}`);
    if (!inst) return;
    const mesh = this.meshes.get(inst.terrainId)!;
    const resting = inst.claimed ? inst.fullColor : inst.dimColor;
    const color = tint ? resting.clone().lerp(tint, blend) : resting;
    mesh.setColorAt(inst.index, color);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Advances any in-flight settle animations. Call once per rendered frame. */
  tick(nowMs: number): void {
    this.animator.tick(nowMs);
    this.tickSwell(nowMs);
  }

  /**
   * Advances the water swell by one frame.
   *
   * Writes both the matrix and the colour for every water tile, every frame,
   * which sounds expensive and is not: it is a sine and two multiplies per
   * tile, at most 130 tiles on the largest map, into buffers that were going
   * to be uploaded anyway. The scratch matrix and colour are reused for the
   * same reason — the arithmetic is free, the allocations would not be.
   *
   * A tile mid-settle is skipped. `SettleAnimator` owns that instance's
   * matrix until the animation lands, and writing to it here would fight the
   * drop-in: the tile would judder between the two.
   */
  private tickSwell(nowMs: number): void {
    if (!this.swellEnabled || this.swellTiles.length === 0) return;

    const seconds = nowMs / 1000;
    const touched = new Set<THREE.InstancedMesh>();

    for (const inst of this.swellTiles) {
      const profile = SWELL_BY_TERRAIN[inst.terrainId];
      if (!profile) continue;
      if (this.animator.isAnimating(inst.index, this.meshes.get(inst.terrainId)!)) continue;

      const mesh = this.meshes.get(inst.terrainId)!;
      // Range [-1, 1]. `swellPhase` is what makes neighbouring tiles crest at
      // different moments, so the motion reads as a wave crossing the board.
      const wave = Math.sin((seconds / profile.periodSeconds) * Math.PI * 2 + inst.swellPhase!);

      const restY = inst.claimed ? 0 : -UNCLAIMED_SINK;
      mesh.setMatrixAt(
        inst.index,
        this.scratchMatrix.makeTranslation(inst.x, restY + (wave * profile.amplitudeY) / 2, inst.z)
      );

      // Brighten toward the crest only — the trough keeps the tile's own
      // colour. Darkening below it as well would read as the sea flickering
      // rather than catching the light.
      const base = inst.claimed ? inst.fullColor : inst.dimColor;
      const lift = Math.max(0, wave) * profile.lightnessGain;
      mesh.setColorAt(
        inst.index,
        this.scratchColor.copy(base).lerp(WHITE, lift)
      );

      touched.add(mesh);
    }

    for (const mesh of touched) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // The swell moves tiles by a few centimetres, which cannot meaningfully
      // change the mesh's bounds — but `InstancedMesh.boundingSphere` is
      // computed lazily and cached forever, and a sphere computed on a frame
      // where tiles happened to be at their trough is then used for every
      // later raycast. Invalidating keeps click-picking self-correcting, for
      // the cost of a null assignment. See SettleAnimator.tick for the bug
      // this class has already produced once.
      mesh.boundingSphere = null;
    }
  }

  /** Re-dims every tile back to unclaimed (a new era resetting the player's footprint — the map itself stays). */
  resetClaims(claimedCoords: Iterable<AxialCoord> = []): void {
    const claimedKeys = new Set(Array.from(claimedCoords, (c) => `${c.q},${c.r}`));
    for (const inst of this.placed.values()) {
      const mesh = this.meshes.get(inst.terrainId)!;
      inst.claimed = claimedKeys.has(`${inst.coord.q},${inst.coord.r}`);
      mesh.setMatrixAt(inst.index, this.restMatrix(inst, new THREE.Matrix4()));
      mesh.setColorAt(inst.index, inst.claimed ? inst.fullColor : inst.dimColor);
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /** Objects to include when raycasting for tile clicks. */
  get raycastTargets(): THREE.Object3D[] {
    return Array.from(this.meshes.values());
  }

  /** Maps a raycast hit (mesh + instanceId) back to the axial coord it represents. */
  coordForHit(object: THREE.Object3D, instanceId: number): AxialCoord | null {
    for (const inst of this.placed.values()) {
      if (this.meshes.get(inst.terrainId) === object && inst.index === instanceId) return inst.coord;
    }
    return null;
  }

  terrainIdAt(coord: AxialCoord): string | undefined {
    return this.placed.get(`${coord.q},${coord.r}`)?.terrainId;
  }

  isClaimedVisually(coord: AxialCoord): boolean {
    return this.placed.get(`${coord.q},${coord.r}`)?.claimed ?? false;
  }

  /** World-space Y a building/prop should sit at on this tile (its top surface, relief included). */
  heightAt(coord: AxialCoord): number {
    const inst = this.placed.get(`${coord.q},${coord.r}`);
    return inst ? this.height(inst.terrainId) + inst.lift : 0;
  }

  /** How far relief lifts this tile (0 on flat maps and on every non-land tile). */
  liftAt(coord: AxialCoord): number {
    return this.placed.get(`${coord.q},${coord.r}`)?.lift ?? 0;
  }

  /**
   * Faint contour lines, every `contourIntervalM` metres.
   *
   * On a hex board a contour runs along tile edges: wherever two neighbouring
   * land tiles lie on either side of a contour height, their shared edge is
   * drawn as a thin dark line on the higher tile's rim. One draw call.
   */
  private buildContours(mapTiles: { coord: AxialCoord; terrainId: string; elevationM?: number }[]): void {
    const byKey = new Map(mapTiles.map((tile) => [axialKey(tile.coord), tile]));
    const points: number[] = [];
    const corners = (cx: number, cz: number): [number, number][] =>
      Array.from({ length: 6 }, (_, i) => {
        const angle = ((60 * i - 30) * Math.PI) / 180;
        return [cx + RELIEF_LAND_RADIUS * Math.cos(angle), cz + RELIEF_LAND_RADIUS * Math.sin(angle)];
      });
    for (const tile of mapTiles) {
      if (tile.elevationM === undefined) continue;
      for (const n of neighbors(tile.coord)) {
        const other = byKey.get(axialKey(n));
        // Each edge once, drawn from its higher side.
        if (!other || other.elevationM === undefined || other.elevationM >= tile.elevationM) continue;
        if (contoursBetween(tile.elevationM, other.elevationM) < 1) continue;
        const a = axialToWorld(tile.coord, HEX_SIZE);
        const b = axialToWorld(n, HEX_SIZE);
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        const edge = corners(a.x, a.z)
          .sort((p, q) => Math.hypot(p[0] - mx, p[1] - mz) - Math.hypot(q[0] - mx, q[1] - mz))
          .slice(0, 2);
        const y = this.height(tile.terrainId) + reliefLift(tile.elevationM) + RELIEF.contourLift;
        // A thin ribbon lying on the higher tile's top, just inside its rim:
        // a one-pixel GL line vanishes at most zooms.
        const inset = (p: [number, number]): [number, number] => {
          const k = (RELIEF_LAND_RADIUS - RELIEF.contourWidth) / RELIEF_LAND_RADIUS;
          return [a.x + (p[0] - a.x) * k, a.z + (p[1] - a.z) * k];
        };
        const [p0, p1] = edge;
        const [i0, i1] = [inset(p0), inset(p1)];
        points.push(p0[0], y, p0[1], p1[0], y, p1[1], i1[0], y, i1[1], p0[0], y, p0[1], i1[0], y, i1[1], i0[0], y, i0[1]);
      }
    }
    if (this.contours) {
      this.group.remove(this.contours);
      this.contours.geometry.dispose();
    }
    if (points.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    // Pulled toward the camera in depth, so the ribbon does not flicker against the top it lies on.
    const material = new THREE.MeshBasicMaterial({ color: RELIEF.contourColor, transparent: true, opacity: RELIEF.contourOpacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.contours = new THREE.Mesh(geometry, material);
    this.contours.name = "terrain-contours";
    this.contours.renderOrder = 2;
    this.group.add(this.contours);
  }

  /** Edges carrying a contour line, for tests and the QA report. */
  get contourEdgeCount(): number {
    return this.contours ? this.contours.geometry.getAttribute("position").count / 6 : 0;
  }
}
