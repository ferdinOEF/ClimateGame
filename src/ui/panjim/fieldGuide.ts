import guideData from "@data/fieldGuide.json";
import { playSound } from "@ui/audioHooks";

/**
 * The Field Guide: ten species of the Panjim coast, collected by tapping the
 * creatures that visit what the player builds.
 *
 * Every page is wildlife that a nature defence brings: kingfishers to
 * mangroves, prawns to a khazan sluice, ghost crabs to pandanus. A seawall's
 * pigeons and sand mining's shorebirds are not in it. Nobody is told that; a
 * player who wants a full guide simply finds themselves planting mangroves.
 *
 * Collection is kept on this device across runs, because a guide that empties
 * every time is not a collection.
 */
export interface Species {
  id: string;
  name: string;
  home: string;
  line: string;
}

export const SPECIES: Species[] = guideData as Species[];
const STORAGE_KEY = "riptide-rising:field-guide:v1";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export class FieldGuide {
  private readonly found = load();
  private readonly button: HTMLButtonElement;
  private readonly backdrop: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTimer = 0;

  constructor(container: HTMLElement, private readonly onNewSpecies: (species: Species) => void) {
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "field-guide-button";
    this.button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.open();
    });
    container.appendChild(this.button);

    this.backdrop = document.createElement("div");
    this.backdrop.className = "field-guide-backdrop";
    this.backdrop.hidden = true;
    this.backdrop.innerHTML = `
      <div class="field-guide-card" role="dialog" aria-label="Field Guide">
        <div class="field-guide-head"><b>Field Guide</b><span class="field-guide-count"></span><button type="button" class="field-guide-close" aria-label="Close">×</button></div>
        <p class="field-guide-hint">Tap the creatures that visit what you build. Free: no time passes.</p>
        <div class="field-guide-grid"></div>
      </div>`;
    this.backdrop.addEventListener("click", (event) => {
      if (event.target === this.backdrop) this.close();
    });
    this.backdrop.querySelector(".field-guide-close")!.addEventListener("click", () => this.close());
    container.appendChild(this.backdrop);
    this.grid = this.backdrop.querySelector(".field-guide-grid")!;

    this.toast = document.createElement("div");
    this.toast.className = "field-guide-toast";
    this.toast.hidden = true;
    container.appendChild(this.toast);
    this.renderButton();
  }

  get count(): number {
    return SPECIES.filter((species) => this.found.has(species.id)).length;
  }

  /** Records species that just appeared under a tap. Returns the new ones. */
  spot(ids: string[]): Species[] {
    const fresh: Species[] = [];
    for (const id of ids) {
      const species = SPECIES.find((entry) => entry.id === id);
      if (!species || this.found.has(id)) continue;
      this.found.add(id);
      fresh.push(species);
    }
    if (fresh.length === 0) return fresh;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.found]));
    } catch {
      // Private mode: the guide lasts for this run.
    }
    playSound("chime");
    this.renderButton();
    this.button.classList.remove("bump");
    void this.button.offsetWidth;
    this.button.classList.add("bump");
    this.showToast(`New in your Field Guide: ${fresh.map((species) => species.name).join(", ")}`);
    for (const species of fresh) this.onNewSpecies(species);
    return fresh;
  }

  private renderButton(): void {
    this.button.textContent = `Field Guide ${this.count}/${SPECIES.length}`;
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 3200);
  }

  open(): void {
    (this.backdrop.querySelector(".field-guide-count") as HTMLElement).textContent = `${this.count} of ${SPECIES.length}`;
    this.grid.innerHTML = "";
    for (const species of SPECIES) {
      const page = document.createElement("div");
      const known = this.found.has(species.id);
      page.className = `field-guide-page${known ? " found" : ""}`;
      page.innerHTML = known
        ? `<b></b><p></p>`
        : `<b>???</b><p>Not seen yet. Something visits a ${species.home.replace("_", " ")}.</p>`;
      if (known) {
        (page.querySelector("b") as HTMLElement).textContent = species.name;
        (page.querySelector("p") as HTMLElement).textContent = species.line;
      }
      this.grid.appendChild(page);
    }
    this.backdrop.hidden = false;
  }

  close(): void {
    this.backdrop.hidden = true;
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  dispose(): void {
    window.clearTimeout(this.toastTimer);
    this.button.remove();
    this.backdrop.remove();
    this.toast.remove();
  }
}
