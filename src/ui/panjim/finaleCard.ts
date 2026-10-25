import type { PanjimIndex } from "@core/panjimIndex";
import { playSound } from "@ui/audioHooks";
import { themeColor } from "@ui/themeColor";
import { downloadStormCard, type StormCardInput } from "./stormCard";

/**
 * The finale: Panjim in 2050.
 *
 * First a title over the whole city as the camera pulls back (the skyline
 * reveal: the houses have risen, the mangroves have grown in), then this
 * card: the stars from each of the three storms, the Panjim 2050 index with
 * its five parts, the tempo badge, and a share card.
 *
 * The tempo badge is real minutes played, given a name. It is shown beside
 * the score and deliberately kept out of it.
 */
export interface FinaleView {
  index: PanjimIndex;
  challengeNames: string[];
  tempo: { name: string; minutes: number };
  seed: string;
  /** The storm the defences did most for, for the side-by-side storm card. */
  stormCard?: StormCardInput | null;
}

export class FinaleCard {
  private readonly root: HTMLElement;

  constructor(private readonly container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "finale";
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  /** The title moment over the board: "25 years · 3 storms", from the run's own numbers. Resolves when it has played. */
  async title(years: number, storms: number): Promise<void> {
    const title = document.createElement("div");
    title.className = "finale-title";
    title.innerHTML = `<div class="finale-title-eyebrow">${years} years, ${storms} storms</div><div class="finale-title-main">Panjim, 2050</div>`;
    this.container.appendChild(title);
    playSound("combo");
    await wait(3200);
    title.classList.add("leaving");
    await wait(600);
    title.remove();
  }

  /** The card. Resolves when the player asks for the results. */
  show(view: FinaleView): Promise<void> {
    const { index } = view;
    const parts: [string, number][] = [
      ["Resilience", index.resilience],
      ["Biodiversity", index.biodiversity],
      ["Livelihoods", index.livelihoods],
      ["Population", index.population],
      ["Food", index.food]
    ];
    this.root.innerHTML = `
      <div class="finale-card" role="dialog" aria-label="Panjim 2050">
        <div class="finale-eyebrow">Panjim 2050</div>
        <div class="finale-index"><span class="finale-index-value">${index.index}</span><span class="finale-index-label">Panjim 2050 index</span></div>
        <div class="finale-parts">${parts
          .map(([label, value]) => `<div class="finale-part"><span>${label}</span><span class="finale-bar"><span style="width:${value}%"></span></span><b>${value}</b></div>`)
          .join("")}</div>
        <div class="finale-storms">${view.challengeNames
          .map(
            (name, i) =>
              `<div class="finale-storm"><span>${name}</span><span class="finale-storm-stars">${"★".repeat(index.challengeStars[i] ?? 0)}${"☆".repeat(3 - (index.challengeStars[i] ?? 0))}</span></div>`
          )
          .join("")}</div>
        <div class="finale-tempo" title="Real time played. It is not part of the score.">Tempo: <b>${view.tempo.name}</b>, ${view.tempo.minutes} min</div>
        <div class="finale-actions">
          <button type="button" class="finale-share">Share card</button>
          ${view.stormCard ? `<button type="button" class="finale-storm-card">Storm card</button>` : ""}
          <button type="button" class="finale-done">See results</button>
        </div>
        <div class="finale-share-note" hidden></div>
      </div>`;
    this.root.hidden = false;
    playSound("star");

    this.root.querySelector(".finale-share")!.addEventListener("click", () => void this.share(view));
    const stormButton = this.root.querySelector<HTMLButtonElement>(".finale-storm-card");
    stormButton?.addEventListener("click", () => {
      if (!view.stormCard) return;
      void downloadStormCard(view.stormCard).then((ok) => {
        const note = this.root.querySelector(".finale-share-note") as HTMLElement;
        note.hidden = !ok;
        note.textContent = "Storm card saved as panjim-storm-card.png: your defences beside none, same storm.";
      });
    });
    return new Promise((resolve) => {
      this.root.querySelector(".finale-done")!.addEventListener("click", () => {
        this.root.hidden = true;
        resolve();
      });
    });
  }

  /** Draws the share card and offers it: the system share sheet where there is one, a download otherwise; plus the text on the clipboard. */
  private async share(view: FinaleView): Promise<void> {
    const canvas = drawShareCard(view);
    const text = `Panjim 2050: index ${view.index.index}, ${view.index.totalStars}/9 stars across three storms (${view.tempo.name}, ${view.tempo.minutes} min). Riptide Rising.`;
    const note = this.root.querySelector(".finale-share-note") as HTMLElement;
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // Clipboard refused: the image is still offered.
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], "panjim-2050.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], text });
        return;
      } catch {
        // Cancelled or unsupported: fall through to the download.
      }
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "panjim-2050.png";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    note.hidden = false;
    note.textContent = "Card saved as panjim-2050.png. The summary is on your clipboard.";
  }

  dispose(): void {
    this.root.remove();
  }
}

/** A 1200×630 card: the index, the stars per storm and the tempo, in the interface's colours (Harbour Morning). */
export function drawShareCard(view: FinaleView): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d")!;
  // Section 33.5d: Harbour Morning, from the tokens: the cream card, a band across its top and the mesh strip.
  const ink = themeColor("--ink", "#1f3d3a");
  ctx.fillStyle = themeColor("--panel", "#f6edd9");
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = themeColor("--band", "#2e6e64");
  ctx.fillRect(0, 0, 1200, 120);
  ctx.fillStyle = themeColor("--warn", "#c4523c");
  ctx.fillRect(0, 0, 24, 630);
  ctx.fillStyle = themeColor("--mesh", "#ede0c4");
  ctx.fillRect(1166, 0, 34, 630);
  ctx.fillStyle = themeColor("--mesh-dot", "#d2bf97");
  for (let y = 4; y < 630; y += 8) for (let x = 1170; x < 1200; x += 8) {
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = themeColor("--band-ink", "#f6edd9");
  ctx.font = '700 28px "Work Sans", system-ui, sans-serif';
  ctx.fillText("RIPTIDE RISING", 70, 72);
  ctx.fillStyle = ink;
  ctx.font = '700 84px "Zilla Slab", Georgia, serif';
  ctx.fillText("Panjim, 2050", 70, 220);

  ctx.font = '700 150px "Zilla Slab", Georgia, serif';
  ctx.fillText(String(view.index.index), 70, 390);
  ctx.fillStyle = themeColor("--ink-2", "#3d5552");
  ctx.font = '500 30px "Work Sans", system-ui, sans-serif';
  ctx.fillText("Panjim 2050 index", 76, 435);

  ctx.font = '500 32px "Work Sans", system-ui, sans-serif';
  view.challengeNames.forEach((name, i) => {
    const stars = view.index.challengeStars[i] ?? 0;
    ctx.fillStyle = ink;
    ctx.fillText(name, 640, 280 + i * 64);
    ctx.fillStyle = themeColor("--cta-shadow", "#b96a1e");
    ctx.fillText("★".repeat(stars) + "☆".repeat(3 - stars), 980, 280 + i * 64);
  });
  ctx.fillStyle = themeColor("--accent-ink", "#2e6e64");
  ctx.font = '500 28px "Work Sans", system-ui, sans-serif';
  ctx.fillText(`Tempo: ${view.tempo.name}, ${view.tempo.minutes} min`, 640, 480);
  return canvas;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
