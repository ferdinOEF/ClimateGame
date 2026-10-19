import * as THREE from "three";

/**
 * The names painted on the landmarks (Section 18): canvas-texture planes laid
 * on the faces the models leave for them (landmarkModels.ts), in each model's
 * own units, so they turn, scale and grow with it. They are part of the
 * buildings, not labels: small, readable close up, never picked by the mouse,
 * and they leave the board's label system as it was.
 */
interface Decal {
  text: string;
  /** Centre of the plane, model units. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Which way the plane faces: +z (front), -z, +x. */
  facing: "+z" | "-z" | "+x";
  ink: string;
  /** Letters stacked one above the other (a tower's name). */
  vertical?: boolean;
}

const DECALS: Readonly<Record<string, readonly Decal[]>> = {
  don_bosco_high_school: [{ text: "DON BOSCO", x: 0.145, y: 0.33, z: -0.0035, w: 0.05, h: 0.42, facing: "+z", ink: "#ffffff", vertical: true }],
  don_bosco_college: [{ text: "DON BOSCO", x: 0.16, y: 0.32, z: 0.0715, w: 0.06, h: 0.44, facing: "+z", ink: "#2f5fb0", vertical: true }],
  sharada_mandir_school: [{ text: "SHARADA MANDIR SCHOOL", x: 0.4135, y: 0.11, z: -0.17, w: 0.2, h: 0.04, facing: "+x", ink: "#2f4f7a" }],
  kala_academy: [{ text: "KALA ACADEMY", x: -0.1, y: 0.07, z: -0.2615, w: 0.36, h: 0.06, facing: "-z", ink: "#fff4e0" }],
  goa_state_museum: [{ text: "GOA STATE MUSEUM", x: 0, y: 0.275, z: 0.1535, w: 0.58, h: 0.04, facing: "+z", ink: "#c8423a" }],
  government_polytechnic_panaji: [{ text: "GOVERNMENT POLYTECHNIC", x: 0, y: 0.14, z: 0.0735, w: 0.15, h: 0.03, facing: "+z", ink: "#ffffff" }],
  dhempe_college: [{ text: "DHEMPE COLLEGE", x: 0, y: 0.385, z: -0.1425, w: 0.46, h: 0.04, facing: "+z", ink: "#7a2a3a" }]
};

/** The texture for one name: dark or light letters on a clear ground, as wide as the plane is. */
function textTexture(decal: Decal): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ratio = decal.w / decal.h;
  canvas.width = decal.vertical ? 64 : 1024;
  canvas.height = decal.vertical ? 512 : Math.max(32, Math.round(1024 / ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = decal.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (decal.vertical) {
    const letters = decal.text.replace(/ /g, "").split("");
    const step = canvas.height / letters.length;
    ctx.font = `700 ${Math.floor(Math.min(step * 0.9, canvas.width * 0.9))}px system-ui, sans-serif`;
    letters.forEach((letter, i) => ctx.fillText(letter, canvas.width / 2, step * (i + 0.5)));
  } else {
    let size = Math.floor(canvas.height * 0.8);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    const fits = canvas.width * 0.94;
    const measured = ctx.measureText(decal.text).width;
    if (measured > fits) size = Math.floor((size * fits) / measured);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.fillText(decal.text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The decal planes for a landmark, in its model's units (empty where it has no name on it, or without a DOM). */
export function landmarkDecals(id: string): THREE.Group | null {
  const decals = DECALS[id];
  if (!decals) return null;
  const group = new THREE.Group();
  group.name = `landmark-decals-${id}`;
  for (const decal of decals) {
    const map = textTexture(decal);
    if (!map) continue;
    const material = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.35, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(decal.w, decal.h), material);
    mesh.position.set(decal.x, decal.y, decal.z);
    if (decal.facing === "-z") mesh.rotation.y = Math.PI;
    if (decal.facing === "+x") mesh.rotation.y = Math.PI / 2;
    // Paint, not a thing to point at: the mouse picks the building under it.
    mesh.raycast = () => undefined;
    group.add(mesh);
  }
  return group.children.length > 0 ? group : null;
}

/** The ids with a name on the building, for the tests. */
export const DECAL_IDS: readonly string[] = Object.keys(DECALS);
