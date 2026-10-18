import { axialToWorld, type AxialCoord } from "@core/hex";
import { mergedArea } from "@core/areaShape";
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
  /** Also frame a cyclone's track from just offshore to where it ends (Section 16.4: onto Sharada Mandir School). */
  frameTrack?: boolean;
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

/** At most this many places named on a forecast's map (Section 16 B4). */
export const MAX_PREVIEW_LABELS = 3;

/** A label's box on the preview's map, in world units: the dot, and the name to its right (font 1.05, about 0.62 em a letter). */
export function previewLabelBox(label: { name: string; q: number; r: number }): { x0: number; z0: number; x1: number; z1: number } {
  const { x, z } = axialToWorld({ q: label.q, r: label.r }, 1);
  return { x0: x - 0.5, z0: z - 0.5, x1: x + 0.75 + label.name.length * 0.65, z1: z + 0.6 };
}

/**
 * The places a forecast's map names (Section 16 B4): in the order given, each
 * kept only if its box clears every one kept before it, at most three. So the
 * names never sit on one another.
 */
export function previewLabels<T extends { name: string; q: number; r: number }>(labels: readonly T[], max = MAX_PREVIEW_LABELS): T[] {
  const kept: { label: T; box: ReturnType<typeof previewLabelBox> }[] = [];
  for (const label of labels) {
    if (kept.length >= max) break;
    const box = previewLabelBox(label);
    const clear = kept.every(({ box: other }) => box.x1 + 0.2 <= other.x0 || other.x1 + 0.2 <= box.x0 || box.z1 + 0.1 <= other.z0 || other.z1 + 0.1 <= box.z0);
    if (clear) kept.push({ label, box });
  }
  return kept.map((k) => k.label);
}

export function renderConePreview(input: ConePreviewInput): HTMLElement {
  const id = `cone-preview-${++previews}`;
  const { cone } = input;
  // Never more than three names, and never one on another (Section 16 B4).
  input = { ...input, labels: previewLabels(input.labels) };
  const byKey = new Map(input.tiles.map((t) => [t.key, t]));
  const world = (key: string): { x: number; z: number } | null => {
    const tile = byKey.get(key);
    return tile ? axialToWorld(tile.coord, 1) : null;
  };

  // The frame (Section 14): on the area to protect and the places it names, with a margin, so
  // the homes at stake fill the map; the cone and its track run on past the edges. With no area,
  // the cone on land and its tracks.
  const points: { x: number; z: number }[] = [];
  const area = mergedArea(cone.area);
  for (const key of area.length > 0 ? area : [...cone.bands.keys(), ...cone.meet]) {
    if (area.length === 0 && byKey.get(key)?.terrainId === "coast") continue;
    const p = world(key);
    if (p) points.push(p);
  }
  if (area.length === 0) for (const track of cone.tracks) points.push(...track.points);
  else if (input.frameTrack) for (const track of cone.tracks) if (track.kind === "cyclone") points.push(...track.points.slice(1));
  for (const label of input.labels) points.push(axialToWorld({ q: label.q, r: label.r }, 1));
  const pad = area.length > 0 ? 3.2 : 2.2;
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
  for (const key of area) {
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
  const svg = figure.querySelector<SVGSVGElement>(".cone-preview-map");
  if (svg) keepLabelsReadable(svg, maxX - minX, maxZ - minZ);
  return figure;
}

/** Labels never under 12 px on screen (Section 14): sized in map units for the size the map is drawn at. */
const MIN_LABEL_PX = 12;
function keepLabelsReadable(svg: SVGSVGElement, viewWidth: number, viewHeight: number): void {
  const fit = (): void => {
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (width < 1 || height < 1) return;
    const pxPerUnit = Math.min(width / viewWidth, height / viewHeight);
    const font = Math.max(1.05, MIN_LABEL_PX / pxPerUnit);
    const k = font / 1.05;
    for (const text of Array.from(svg.querySelectorAll<SVGTextElement>(".cone-preview-place text"))) {
      text.style.fontSize = `${font}px`;
      text.style.strokeWidth = `${0.32 * k}px`;
    }
    for (const dot of Array.from(svg.querySelectorAll<SVGCircleElement>(".cone-preview-place circle"))) dot.setAttribute("r", fmt(0.42 * Math.min(k, 1.6)));
  };
  if (typeof ResizeObserver === "function") {
    let shown = false;
    const observer = new ResizeObserver(() => {
      // Let go once the map has been shown and taken off the page (its card closed).
      if (svg.isConnected) shown = true;
      else if (shown) {
        observer.disconnect();
        return;
      }
      fit();
    });
    observer.observe(svg);
  }
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fit);
}
