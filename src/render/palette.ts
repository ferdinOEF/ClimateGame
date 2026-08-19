import * as THREE from "three";

/**
 * Goan color palette (Section 6): laterite red/roof-tile, Arabian Sea
 * turquoise-to-deep-blue, paddy green, sun-bleached sand gold, mangrove
 * teal-green. Deliberately not a flat postcard tropical green/blue-only set.
 *
 * Lightness is deliberately spread ~20-26 luma points apart across the 7
 * terrain colors (checked against the 0.3R+0.59G+0.11B luma the Section 6
 * grayscale QA method uses) so adjacent tiles stay distinguishable with all
 * color removed, not just by hue. Two same-hue-family colors that sat only
 * ~4 luma points apart (laterite vs. river) were the failure caught here.
 */
export const PALETTE: Record<string, THREE.Color> = {
  forestDeep: new THREE.Color("#274D2C"), // luma ~62
  mangroveTeal: new THREE.Color("#2C6E5E"), // luma ~88
  lateriteRed: new THREE.Color("#C25730"), // luma ~115
  riverBlue: new THREE.Color("#4B9FBD"), // luma ~137
  paddyGreen: new THREE.Color("#8ABE4E"), // luma ~162
  plainsGreen: new THREE.Color("#A7CE5E"), // luma ~182
  sandGold: new THREE.Color("#EAD08A"), // luma ~208
  seaDeep: new THREE.Color("#0E3F57"),
  seaTurquoise: new THREE.Color("#2FA6A2"),
  fog: new THREE.Color("#D9E6E0"),
  sky: new THREE.Color("#CFE6E8"),
  // Building accent colors — deliberately distinct from every terrain
  // colorKey above so a prop never blends into the tile it sits on.
  paddyRipe: new THREE.Color("#D9A63E") // golden amber, ripening rice
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
