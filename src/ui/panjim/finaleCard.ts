import type { PanjimIndex } from "@core/panjimIndex";
import { playSound } from "@ui/audioHooks";

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
}

export class FinaleCard {
  private readonly root: HTMLElement;

  constructor(private readonly container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "finale";
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  /** The title moment over the board. Resolves when it has played. */
  async title(): Promise<void> {
    const title = document.createElement("div");
    title.className = "finale-title";
    title.innerHTML = `<div class="finale-title-eyebrow">25 years · 3 storms</div><div class="finale-title-main">Panjim, 2050</div>`;
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
        <div class="finale-tempo" title="Real time played. It is not part of the score.">Tempo: <b>${view.tempo.name}</b> · ${view.tempo.minutes} min</div>
        <div class="finale-actions">
          <button type="button" class="finale-share">Share card</button>
          <button type="button" class="finale-done">See results</button>
        </div>
        <div class="finale-share-note" hidden></div>
      </div>`;
    this.root.hidden = false;
    playSound("star");

    this.root.querySelector(".finale-share")!.addEventListener("click", () => void this.share(view));
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

/** A 1200×630 card: the index, the stars per storm and the tempo, in the game's colours. */
export function drawShareCard(view: FinaleView): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, "#1d3a33");
  gradient.addColorStop(1, "#5c2a1a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "rgba(242,195,91,0.12)";
  for (let i = 0; i < 9; i++) ctx.fillRect(0, 540 + i * 10, 1200, 4);

  ctx.fillStyle = "#9fd8c6";
  ctx.font = "600 28px Inter, system-ui, sans-serif";
  ctx.fillText("RIPTIDE RISING", 70, 90);
  ctx.fillStyle = "#fdf6e6";
  ctx.font = "700 84px Georgia, serif";
  ctx.fillText("Panjim, 2050", 70, 190);

  ctx.fillStyle = "#f2c35b";
  ctx.font = "800 150px Georgia, serif";
  ctx.fillText(String(view.index.index), 70, 380);
  ctx.fillStyle = "#fdf6e6";
  ctx.font = "500 30px Inter, system-ui, sans-serif";
  ctx.fillText("Panjim 2050 index", 76, 425);

  ctx.font = "500 32px Inter, system-ui, sans-serif";
  view.challengeNames.forEach((name, i) => {
    const stars = view.index.challengeStars[i] ?? 0;
    ctx.fillStyle = "#fdf6e6";
    ctx.fillText(name, 640, 270 + i * 64);
    ctx.fillStyle = "#f2c35b";
    ctx.fillText("★".repeat(stars) + "☆".repeat(3 - stars), 980, 270 + i * 64);
  });
  ctx.fillStyle = "#9fd8c6";
  ctx.font = "500 28px Inter, system-ui, sans-serif";
  ctx.fillText(`Tempo: ${view.tempo.name} · ${view.tempo.minutes} min`, 640, 480);
  return canvas;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
