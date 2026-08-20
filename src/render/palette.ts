import * as THREE from "three";

/**
 * Goan coastal color palette (Section 6, v2.4 layout: Sea/Beach/Land/
 * Estuary/River): Arabian Sea turquoise, sun-bleached sand gold, inland
 * plains green, river blue, mangrove teal-green. Deliberately not a flat
 * postcard tropical green/blue-only set.
 *
 * Lightness is deliberately spread across the 5 terrain colors (checked
 * against the 0.3R+0.59G+0.11B luma the Section 6 grayscale QA method uses)
 * so adjacent tiles stay distinguishable with all color removed, not just
 * by hue: mangroveTeal ~88, seaTurquoise ~130, riverBlue ~137,
 * landGreen ~182, sandGold ~208.
 */
export const PALETTE: Record<string, THREE.Color> = {
  mangroveTeal: new THREE.Color("#2C6E5E"), // estuary
  seaTurquoise: new THREE.Color("#2FA6A2"), // coast
  riverBlue: new THREE.Color("#4B9FBD"), // river
  landGreen: new THREE.Color("#A7CE5E"), // land (interior)
  sandGold: new THREE.Color("#EAD08A"), // beach
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
