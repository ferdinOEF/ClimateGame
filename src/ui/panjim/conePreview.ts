import { axialToWorld, type AxialCoord } from "@core/hex";
import type { ForecastCone } from "@core/forecastCone";

/**
 * A small map of a storm's forecast cone (Section 8), for the start popup and
 * the result cards: the real board round the cone, drawn flat, with the cone
 * from the hazard model on it. Most likely, Likely and Possible bands (dark,
 * mid and light red: they differ by lightness), the dashed track with its
 * arrowhead, the dashed outline of the area to protect, the hatched "Where
 * they meet" for the compound storm, and the named places. The legend sits
 * under it. Nothing moves, so there is nothing to calm for reduced motion.
 */
export interface ConePreviewInput {
  /** Every tile on the board: its key, coordinate and terrain. */
  tiles: readonly { key: string; coord: AxialCoord; terrainId: string }[];
  cone: ForecastCone;
  /** Places to name on the map. */
  labels: readonly { name: string; q: number; r: number }[];
  /** The line over the map: "The first cyclone lands in 5 years". */
  line: string;
}

/** The board drawn quietly under the cone. */
const TERRAIN: Record<string, string> = {
  coast: "#167C77",
  beach: "#F0B94A",
  land: "#8EAB4F",
  river: "#3E86B0",
  estuary: "#1F5C4E"
};
/** The bands, as on the board: dark, mid and light red. */
const BAND: Record<number, string> = { 3: "#821a1c", 2: "#dc5a4a", 1: "#fdc2b4" };
let previews = 0;

/** A pointy-top hex of size 1 round world (x, z). */
function corners(x: number, z: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 30) * Math.PI) / 180;
    out.push([x + Math.cos(a), z + Math.sin(a)]);
  }
  return out;
}

const fmt = (n: number): string => n.toFixed(2);
const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The legend: the three bands, the area to protect, and where they meet for the compound storm. */
export function coneLegendHtml(meet: boolean): string {
  return `<ul class="cone-legend">
    <li><span class="cone-swatch band-3" aria-hidden="true"></span>Most likely</li>
    <li><span class="cone-swatch band-2" aria-hidden="true"></span>Likely</li>
    <li><span class="cone-swatch band-1" aria-hidden="true"></span>Possible</li>
    <li><span class="cone-swatch area" aria-hidden="true"></span>Area to protect</li>
    ${meet ? `<li><span class="cone-swatch meet" aria-hidden="true"></span>Where they meet</li>` : ""}
  </ul>`;
}

export function renderConePreview(input: ConePreviewInput): HTMLElement {
  const id = `cone-preview-${++previews}`;
  const { cone } = input;
  const byKey = new Map(input.tiles.map((t) => [t.key, t]));
  const world = (key: string): { x: number; z: number } | null => {
    const tile = byKey.get(key);
    return tile ? axialToWorld(tile.coord, 1) : null;
  };

  // The frame: the cone on land, its area, its tracks and the named places, with a margin.
  const points: { x: number; z: number }[] = [];
  for (const key of [...cone.bands.keys(), ...cone.area, ...cone.meet]) {
    if (byKey.get(key)?.terrainId === "coast") continue;
    const p = world(key);
    if (p) points.push(p);
  }
  for (const track of cone.tracks) points.push(...track.points);
  for (const label of input.labels) points.push(axialToWorld({ q: label.q, r: label.r }, 1));
  const pad = 2.2;
  let minX = Math.min(...points.map((p) => p.x)) - pad;
  let maxX = Math.max(...points.map((p) => p.x)) + pad;
  let minZ = Math.min(...points.map((p) => p.z)) - pad;
  let maxZ = Math.max(...points.map((p) => p.z)) + pad;
  // No narrower than 4:3 and no taller than square, so it reads as a map, not a strip.
  const width = maxX - minX;
  const height = maxZ - minZ;
  if (width < height) {
    const grow = (height - width) / 2;
    minX -= grow;
    maxX += grow;
  } else if (height < width * 0.6) {
    const grow = (width * 0.6 - height) / 2;
    minZ -= grow;
    maxZ += grow;
  }
  const inView = (x: number, z: number): boolean => x > minX - 1.2 && x < maxX + 1.2 && z > minZ - 1.2 && z < maxZ + 1.2;

  const ground: string[] = [];
  const bands: string[] = [];
  for (const tile of input.tiles) {
    const { x, z } = axialToWorld(tile.coord, 1);
    if (!inView(x, z)) continue;
    const d = `M${corners(x, z).map(([cx, cz]) => `${fmt(cx)},${fmt(cz)}`).join("L")}Z`;
    ground.push(`<path d="${d}" fill="${TERRAIN[tile.terrainId] ?? "#556"}"/>`);
    const band = cone.bands.get(tile.key);
    if (band) bands.push(`<path d="${d}" fill="${BAND[band]}"/>`);
  }
  const meet = cone.meet.map((key) => {
    const p = world(key);
    return p ? `<path d="M${corners(p.x, p.z).map(([cx, cz]) => `${fmt(cx)},${fmt(cz)}`).join("L")}Z" fill="url(#${id}-hatch)"/>` : "";
  });

  // The area to protect: the outline of its tiles together (edges that only one of them has).
  const edges = new Map<string, [number, number, number, number]>();
  const count = new Map<string, number>();
  for (const key of cone.area) {
    const p = world(key);
    if (!p) continue;
    const c = corners(p.x, p.z);
    for (let i = 0; i < 6; i++) {
      const [ax, az] = c[i];
      const [bx, bz] = c[(i + 1) % 6];
      const mid = `${Math.round(((ax + bx) / 2) * 20)},${Math.round(((az + bz) / 2) * 20)}`;
      edges.set(mid, [ax, az, bx, bz]);
      count.set(mid, (count.get(mid) ?? 0) + 1);
    }
  }
  const outline = [...edges].filter(([mid]) => count.get(mid) === 1).map(([, [ax, az, bx, bz]]) => `M${fmt(ax)},${fmt(az)}L${fmt(bx)},${fmt(bz)}`).join("");

  const tracks = cone.tracks
    .map((track) => track.points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)},${fmt(p.z)}`).join(""))
    .map((d) => `<path d="${d}" fill="none" stroke="#fff3e0" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round"/>` + `<path d="${d}" fill="none" stroke="#2a0c08" stroke-width="0.38" stroke-dasharray="0.9 0.6" stroke-linejoin="round" marker-end="url(#${id}-arrow)"/>`)
    .join("");

  const labels = input.labels
    .map((label) => {
      const { x, z } = axialToWorld({ q: label.q, r: label.r }, 1);
      return `<g class="cone-preview-place"><circle cx="${fmt(x)}" cy="${fmt(z)}" r="0.42" fill="#fff3e0" stroke="#2a0c08" stroke-width="0.18"/><text x="${fmt(x + 0.75)}" y="${fmt(z + 0.4)}">${esc(label.name)}</text></g>`;
    })
    .join("");

  const kind = cone.kind === "cyclone" ? "cyclone" : cone.kind === "flood" ? "flood" : "cyclone and flood";
  const names = input.labels.map((l) => l.name).join(" and ");
  const figure = document.createElement("figure");
  figure.className = "cone-preview";
  figure.innerHTML = `
    <p class="cone-preview-line">${esc(input.line)}</p>
    <svg class="cone-preview-map" viewBox="${fmt(minX)} ${fmt(minZ)} ${fmt(maxX - minX)} ${fmt(maxZ - minZ)}" role="img" aria-label="${esc(`Forecast map of the ${kind}: where its water is most likely, likely and possible to reach, its track, and the area to protect${names ? `, with ${names}` : ""}.`)}">
      <defs>
        <pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="0.8" height="0.8" patternTransform="rotate(-45)">
          <rect width="0.8" height="0.8" fill="#4c38b3"/><rect width="0.32" height="0.8" fill="#ecebff"/>
        </pattern>
        <marker id="${id}-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#2a0c08" stroke="#fff3e0" stroke-width="1.2"/>
        </marker>
      </defs>
      <g opacity="0.55">${ground.join("")}</g>
      <g opacity="0.92">${bands.join("")}</g>
      <g>${meet.join("")}</g>
      <path d="${outline}" fill="none" stroke="#fff3e0" stroke-width="0.6" stroke-linecap="round"/>
      <path d="${outline}" fill="none" stroke="#2a0c08" stroke-width="0.3" stroke-dasharray="0.7 0.5" stroke-linecap="round"/>
      ${tracks}
      ${labels}
    </svg>
    ${coneLegendHtml(cone.meet.length > 0)}`;
  return figure;
}
