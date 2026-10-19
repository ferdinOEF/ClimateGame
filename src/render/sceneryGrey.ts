import * as THREE from "three";
import { axialKey, neighbors, type AxialCoord } from "@core/hex";

/*
 * The look of scenery tiles (Panaji's north bank, Section 11.4, and east edge, 19.2): the same city,
 * just quieter. Half the colour taken out and a touch darker, no veil, no
 * hatching and no border; the tiles along the edge of the playable board take
 * part of it, so the change fades in over one tile rather than stopping on a
 * line. Applied after the street-map layer is mixed in, so the map's own
 * place names on the bank are muted with it.
 */

/** How much colour a scenery tile loses (0 none, 1 grey) and how much darker it gets. */
export const SCENERY_GREY = { desaturate: 0.5, darken: 0.1, edge: 0.7 };

/**
 * Each scenery tile's grey level: 1 inside, `edge` on a tile that touches the
 * playable board (the 1-tile fade). Tiles that are not scenery are absent.
 */
export function sceneryGreyLevels(tiles: readonly { coord: AxialCoord; scenery?: boolean }[]): Map<string, number> {
  const scenery = new Set(tiles.filter((tile) => tile.scenery).map((tile) => axialKey(tile.coord)));
  const onBoard = new Set(tiles.map((tile) => axialKey(tile.coord)));
  const levels = new Map<string, number>();
  for (const key of scenery) {
    const [q, r] = key.split(",").map(Number);
    const edge = neighbors({ q, r }).some((n) => onBoard.has(axialKey(n)) && !scenery.has(axialKey(n)));
    levels.set(key, edge ? SCENERY_GREY.edge : 1);
  }
  return levels;
}

/** `color` at grey level `level`, in place (the CPU twin of `SCENERY_GREY_GLSL`). */
export function greyColor(color: THREE.Color, level: number): THREE.Color {
  if (level <= 0) return color;
  const luma = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  const mix = SCENERY_GREY.desaturate * level;
  const keep = 1 - SCENERY_GREY.darken * level;
  return color.setRGB((color.r + (luma - color.r) * mix) * keep, (color.g + (luma - color.g) * mix) * keep, (color.b + (luma - color.b) * mix) * keep);
}

/** Vertex declarations: a per-instance `aGrey` handed to the fragment as `vGrey`. */
export const SCENERY_GREY_VERTEX_DECL = "attribute float aGrey;\nvarying float vGrey;";
/** Vertex body: pass it on (inside `main`, after `#include <begin_vertex>` or similar). */
export const SCENERY_GREY_VERTEX = "vGrey = aGrey;";
/** Fragment declaration. */
export const SCENERY_GREY_FRAGMENT_DECL = "varying float vGrey;";
/** Fragment body, after the colour is settled (`diffuseColor`). */
export const SCENERY_GREY_GLSL = `
  if ( vGrey > 0.0 ) {
    float sceneryLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( sceneryLuma ), ${SCENERY_GREY.desaturate.toFixed(3)} * vGrey ) * ( 1.0 - ${SCENERY_GREY.darken.toFixed(3)} * vGrey );
  }`;
