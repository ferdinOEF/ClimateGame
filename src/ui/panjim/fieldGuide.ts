import guideData from "@data/fieldGuide.json";
import { playSound } from "@ui/audioHooks";
import { refreshSavedNotes } from "@core/mayaLines";

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
/** Maya's tips, kept as pages so they can be reread. */
const NOTES_KEY = "riptide-rising:maya-notes:v1";

/** A page in the guide written by Maya: one tip she gave. */
export interface GuideNote {
  id: string;
  title: string;
  text: string;
}

function loadNotes(): GuideNote[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    const parsed = raw ? (JSON.parse(raw) as GuideNote[]) : [];
    if (!Array.isArray(parsed)) return [];
    // Saved notes carry the words they were saved with: bring them up to
    // date, and drop lines that no longer exist (core/mayaLines.ts).
    return refreshSavedNotes(parsed.filter((note) => typeof note?.id === "string" && typeof note.text === "string"));
  } catch {
    return [];
  }
}

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
  private readonly notes = loadNotes();
  /** Asks Maya to say a note again (the "Hear it again" button on its page). */
  onReplayNote: ((note: GuideNote) => void) | null = null;
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
        <div class="field-guide-notes-head"><b>Maya's notes</b><span class="field-guide-notes-count"></span></div>
        <ul class="field-guide-notes"></ul>
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

  /** Records one of Maya's tips as a page. Returns true if it was new. */
  addNote(note: GuideNote): boolean {
    if (this.notes.some((existing) => existing.id === note.id)) return false;
    this.notes.push({ id: note.id, title: note.title, text: note.text });
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(this.notes));
    } catch {
      // Private mode: the notes last for this run.
    }
    this.renderButton();
    return true;
  }

  /** The guide's button, for its tooltip. */
  get buttonEl(): HTMLButtonElement {
    return this.button;
  }

  get speciesTotal(): number {
    return SPECIES.length;
  }

  get noteCount(): number {
    return this.notes.length;
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
    if (this.notes.length > 0) {
      const notes = document.createElement("span");
      notes.className = "field-guide-button-notes";
      notes.textContent = ` · ${this.notes.length} note${this.notes.length === 1 ? "" : "s"}`;
      this.button.appendChild(notes);
    }
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
    const list = this.backdrop.querySelector(".field-guide-notes") as HTMLElement;
    (this.backdrop.querySelector(".field-guide-notes-count") as HTMLElement).textContent =
      this.notes.length === 0 ? "None yet: Maya's tips land here." : `${this.notes.length}`;
    list.innerHTML = "";
    for (const note of this.notes) {
      const item = document.createElement("li");
      item.className = "field-guide-note";
      item.innerHTML = `<b></b><p></p><button type="button" class="field-guide-replay">Hear it again</button>`;
      (item.querySelector("b") as HTMLElement).textContent = note.title;
      (item.querySelector("p") as HTMLElement).textContent = note.text;
      item.querySelector("button")!.addEventListener("click", () => {
        this.close();
        this.onReplayNote?.(note);
      });
      list.appendChild(item);
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
