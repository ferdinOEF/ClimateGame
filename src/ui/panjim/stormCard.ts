import { axialToWorld } from "@core/hex";
import { peakDepth } from "@core/hazard";
import type { StormRecord } from "@core/stormRecord";

/**
 * The storm card: one storm, side by side, with the player's defences and
 * with none. Same storm, same board; only the defences differ. Both halves
 * are the resolver's own results (the record's actual outcome and its
 * undefended comparison), drawn from their depth fields.
 *
 * Drawn on a canvas in the browser and saved only when the player asks: no
 * network, no personal data, nothing but the board and the counts.
 *
 * Houses hit are red with a white cross and houses kept dry green with no
 * mark, so the card reads without colour too.
 */
export interface StormCardInput {
  title: string;
  tiles: { key: string; terrainId: string }[];
  record: StormRecord;
  /** Tiles holding a defence against this storm (drawn as small gold squares on the defended half). */
  defences: string[];
}

const W = 1200;
const H = 630;
const TERRAIN: Record<string, string> = {
  land: "#cfd8b0",
  beach: "#ead59c",
  coast: "#5f93b6",
  river: "#4a7fae",
  estuary: "#93b9a9"
};

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = x + Math.sin(a) * r;
    const py = y + Math.cos(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawStormCard(input: StormCardInput): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1c2521";
  ctx.fillRect(0, 0, W, H);

  // Fit the board into each half.
  const points = input.tiles.map((tile) => {
    const [q, r] = tile.key.split(",").map(Number);
    const w = axialToWorld({ q, r }, 1.0);
    return { tile, x: w.x, z: w.z };
  });
  const minX = Math.min(...points.map((p) => p.x)) - 1;
  const maxX = Math.max(...points.map((p) => p.x)) + 1;
  const minZ = Math.min(...points.map((p) => p.z)) - 1;
  const maxZ = Math.max(...points.map((p) => p.z)) + 1;
  const panelW = 560;
  const panelH = 420;
  const scale = Math.min(panelW / (maxX - minX), panelH / (maxZ - minZ));
  const halves = [
    { x0: 20, label: "With your defences", outcome: input.record.outcome, field: input.record.field, defended: true },
    { x0: 620, label: "With no defences", outcome: input.record.undefended.outcome, field: input.record.undefended.field, defended: false }
  ];
  const defences = new Set(input.defences);
  for (const half of halves) {
    const ox = half.x0 + (panelW - (maxX - minX) * scale) / 2;
    const oy = 150 + (panelH - (maxZ - minZ) * scale) / 2;
    const hit = new Set(half.outcome.damagedHouses);
    for (const { tile, x, z } of points) {
      const px = ox + (x - minX) * scale;
      const py = oy + (z - minZ) * scale;
      const r = scale * 0.98;
      hexPath(ctx, px, py, r);
      ctx.fillStyle = TERRAIN[tile.terrainId] ?? "#cfd8b0";
      ctx.fill();
      const depth = half.field.tiles.get(tile.key);
      const peak = tile.terrainId === "coast" ? 0 : peakDepth(half.field, tile.key);
      if (depth && peak > 0.02) {
        const surge = depth.surgePeak > 0;
        const flood = depth.floodPeak > 0 || depth.backwaterPeak > 0;
        const alpha = Math.min(0.85, 0.3 + peak * 0.35);
        ctx.fillStyle = surge && flood ? `rgba(88,70,160,${alpha})` : flood ? `rgba(18,62,125,${alpha})` : `rgba(60,150,200,${alpha})`;
        hexPath(ctx, px, py, r);
        ctx.fill();
      }
      if (depth?.house) {
        const dot = Math.max(2.2, scale * 0.42);
        ctx.beginPath();
        ctx.arc(px, py, dot, 0, Math.PI * 2);
        ctx.fillStyle = hit.has(tile.key) ? "#d9553d" : "#4fae6a";
        ctx.fill();
        if (hit.has(tile.key)) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = Math.max(1, dot * 0.35);
          ctx.beginPath();
          ctx.moveTo(px - dot * 0.6, py - dot * 0.6);
          ctx.lineTo(px + dot * 0.6, py + dot * 0.6);
          ctx.moveTo(px + dot * 0.6, py - dot * 0.6);
          ctx.lineTo(px - dot * 0.6, py + dot * 0.6);
          ctx.stroke();
        }
      } else if (half.defended && defences.has(tile.key)) {
        const s = Math.max(2, scale * 0.5);
        ctx.fillStyle = "#f2c35b";
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
    }
    ctx.fillStyle = "#f4efe2";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText(half.label, half.x0 + 8, 132);
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillStyle = half.outcome.housesDamaged > 0 ? "#ff8a73" : "#8fdca4";
    const count = `${half.outcome.housesDamaged} ${half.outcome.housesDamaged === 1 ? "home" : "homes"} hit`;
    ctx.fillText(count, half.x0 + panelW - ctx.measureText(count).width - 8, 132);
  }

  ctx.fillStyle = "#e8a64a";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText("RIPTIDE RISING · PANJIM 2050", 28, 40);
  ctx.fillStyle = "#f4efe2";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText(input.title, 28, 72);
  ctx.fillStyle = "#cfc6b2";
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillText("Same storm, same board: only the defences differ.   ● not hit   ✕ hit   ■ defence", 28, 608);
  return canvas;
}

/** Saves the card as a PNG, on the player's click. Nothing leaves the browser. */
export async function downloadStormCard(input: StormCardInput, filename = "panjim-storm-card.png"): Promise<boolean> {
  const canvas = drawStormCard(input);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return false;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  return true;
}
