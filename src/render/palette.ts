import * as THREE from "three";

/**
 * Goan coastal color palette (Section 6, v2.4 layout: Sea/Beach/Land/
 * Estuary/River): Arabian Sea turquoise, sun-bleached sand gold, inland
 * plains green, river blue, mangrove teal-green. Deliberately not a flat
 * postcard tropical green/blue-only set.
 *
 * `STEP_PROMPT_visuals_map_river.md` item 1 found the previous version of
 * this palette read as a narrow olive/khaki/tan band once actually
 * rendered and grayscale-sampled (claimed vs. unclaimed Beach only ~1
 * point of luminance apart) — under-saturated hues alone weren't doing the
 * "Goan, not generic-tropical" job either. Deepened/punched up every base
 * color and re-spread their grayscale luminance (0.3R+0.59G+0.11B) further
 * apart: mangroveTeal ~72, seaTurquoise ~93, riverBlue ~117,
 * landGreen ~162, sandGold ~189. These are the CLAIMED/full-color values;
 * `terrainMeshManager.ts`'s `dim()` is what's actually responsible for the
 * claimed-vs-unclaimed gap now (a real lightness drop, not a blend toward
 * this file's `fog`) — see its comment.
 */
export const PALETTE: Record<string, THREE.Color> = {
  mangroveTeal: new THREE.Color("#1F5C4E"), // estuary — deep mangrove teal
  seaTurquoise: new THREE.Color("#167C77"), // coast — Arabian Sea turquoise
  riverBlue: new THREE.Color("#3E86B0"), // river
  landGreen: new THREE.Color("#8FBF3E"), // land (interior)
  sandGold: new THREE.Color("#F0B94A"), // beach — sun-bleached sand gold
  fog: new THREE.Color("#D9E6E0"),
  sky: new THREE.Color("#CFE6E8"),
  // Element accent colors — deliberately distinct from every terrain
  // colorKey above so a prop never blends into the tile it sits on. Organic
  // greens for NBS, flat concrete gray for engineered, earthy bund-brown
  // for the hybrid khazan, warm gold for the one income building.
  defenseDune: new THREE.Color("#C9B071"),
  defenseSandyVegetation: new THREE.Color("#5FA84A"),
  resortGold: new THREE.Color("#D9A63E"),
  defenseEngineered: new THREE.Color("#7C8277"),
  defenseSandMining: new THREE.Color("#C68A3D"), // warm sandy-orange — distinct from the cool-gray engineered family
  defenseMangrove: new THREE.Color("#4FAE6E"),
  defenseKhazanBund: new THREE.Color("#8C6A3F"),
  houseTerracotta: new THREE.Color("#C25730") // laterite-tile roof red
};

export function paletteColor(key: string): THREE.Color {
  return PALETTE[key] ?? new THREE.Color("#999999");
}

/** Small deterministic per-instance jitter so flat color fields don't look uniform/plastic. */
export function jitterColor(base: THREE.Color, seed: number): THREE.Color {
  const c = base.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const jitter = (Math.sin(seed * 12.9898) * 43758.5453) % 1;
  const delta = (jitter - Math.floor(jitter) - 0.5) * 0.06;
  c.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s, 0, 1), THREE.MathUtils.clamp(hsl.l + delta, 0, 1));
  return c;
}
