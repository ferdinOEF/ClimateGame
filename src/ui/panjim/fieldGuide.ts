import guideData from "@data/fieldGuide.json";
import { playSound } from "@ui/audioHooks";
import { noteIdsFor, notesProgress } from "@core/mayaLines";
import { factById } from "@core/facts";
import { BROKEN_RULE, defenceRules } from "@ui/panjim/defenceCards";
import { COMBO_INFO, COMBO_SOURCE, comboNote } from "@core/combos";

/**
 * The Field Guide: eleven species of the Panjim coast, collected by tapping the
 * creatures on the board: ten visit what the player builds, the dolphin swims
 * in the open water whatever is built.
 *
 * Every page but one is wildlife that a nature defence brings: kingfishers to
 * mangroves, prawns to a khazan sluice, ghost crabs to pandanus. A seawall's
 * pigeons and sand mining's shorebirds are not in it. Nobody is told that; a
 * player who wants a full guide simply finds themselves planting mangroves.
 * The one other page (Section 18) is the humpback dolphin, which swims in the
 * open water whatever is built; its page says so, with one cited fact.
 *
 * Collection is kept on this device across runs, because a guide that empties
 * every time is not a collection.
 *
 * Section 25.1: after the creatures, each defence's pro and con, labelled as
 * game rules ("In this game…"), built from the game's own numbers.
 */
export interface Species {
  id: string;
  name: string;
  home: string;
  line: string;
  /** A cited fact shown on the page once found (facts.json id), with its source. */
  fact?: string;
}

export const SPECIES: Species[] = guideData as Species[];

/** Section 34b.7: what each home is called in the game (the build cards' words); pandanus and mangrove take no article. */
const HOME_NAME: Record<string, string> = {
  dune: "a dune",
  sandy_vegetation: "pandanus",
  mangrove: "mangrove",
  khazan: "a khazan",
  small_dam: "a small dam",
  breakwater: "a breakwater",
  seawall: "a seawall"
};

/** An unseen creature's line: "Not seen yet. Something visits pandanus." */
export function visitLine(home: string): string {
  return home === "water" ? "Not seen yet. Something swims in the open water." : `Not seen yet. Something visits ${HOME_NAME[home] ?? `a ${home.replace(/_/g, " ")}`}.`;
}

/** Section 34b.7: the guide's line under its name in the menu: "1 of 22 notes, 0 of 11 creatures" (no notes while Maya is hidden). */
export function guideCounts(notes: string | null, found: number, total: number): string {
  return `${notes ? `${notes} notes, ` : ""}${found} of ${total} creatures`;
}
// Section 28.2 (owner decision): the creatures found and Maya's notes last for this visit only; nothing is saved
// on the machine (the old keys are cleared on load, services/storagePolicy.ts).

/** A page in the guide written by Maya: one tip she gave. */
export interface GuideNote {
  id: string;
  title: string;
  text: string;
}

export class FieldGuide {
  private readonly found = new Set<string>();
  private readonly notes: GuideNote[] = [];
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
        <p class="field-guide-hint">Tap the creatures you see on the board. Free: no time passes.</p>
        <div class="field-guide-grid"></div>
        <div class="field-guide-defences-head"><b>Defences</b><span class="result-rule">Game rules</span></div>
        <ul class="field-guide-defences"></ul>
        <div class="field-guide-notes-head"><b>Maya's notes</b><span class="field-guide-notes-count"></span></div>
        <ul class="field-guide-notes"></ul>
      </div>`;
    this.backdrop.addEventListener("click", (event) => {
      if (event.target === this.backdrop) this.close();
    });
    this.backdrop.querySelector(".field-guide-close")!.addEventListener("click", () => this.close());
    container.appendChild(this.backdrop);
    window.addEventListener("keydown", this.onKey, true);
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
    playSound("chime");
    this.renderButton();
    this.button.classList.remove("bump");
    void this.button.offsetWidth;
    this.button.classList.add("bump");
    this.showToast(`New in your Field Guide: ${fresh.map((species) => species.name).join(", ")}`);
    for (const species of fresh) this.onNewSpecies(species);
    return fresh;
  }

  /** The Field Guide's one count (Section 13): Maya's notes held, of every note there is. Her bubble shows the same. */
  notesProgress(plus?: string): string {
    return notesProgress(this.notes.map((note) => note.id), this.countable, plus);
  }

  /** The notes this level can give (set by the level; every note there is until then). */
  countable: ReadonlySet<string> = noteIdsFor({ opening: false, excluded: new Set() });

  /** Whether Maya's notes (and their count on the button) are shown: not while she is hidden (Section 17c). */
  private notesShown = true;

  showNotes(on: boolean): void {
    this.notesShown = on;
    this.backdrop.classList.toggle("no-notes", !on);
    this.renderButton();
  }

  private renderButton(): void {
    // Section 34b.7: the menu's line said "1 of 22" (Maya's notes) while the guide opened on "0 of 11" (creatures).
    this.button.innerHTML = `Field Guide<span class="field-guide-sub"></span>`;
    (this.button.querySelector(".field-guide-sub") as HTMLElement).textContent = guideCounts(this.notesShown ? this.notesProgress() : null, this.count, SPECIES.length);
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 3200);
  }

  /** Called as the guide opens (the menu it was opened from closes). */
  onOpen: (() => void) | null = null;

  open(): void {
    this.onOpen?.();
    // Section 30.11 bug 9: one count, the creatures.
    (this.backdrop.querySelector(".field-guide-count") as HTMLElement).textContent = `Creatures spotted: ${this.count} of ${SPECIES.length}`;
    this.grid.innerHTML = "";
    for (const species of SPECIES) {
      const page = document.createElement("div");
      const known = this.found.has(species.id);
      page.className = `field-guide-page${known ? " found" : ""}`;
      page.innerHTML = known
        ? `<b></b><p></p>`
        : `<b>???</b><p>${visitLine(species.home)}</p>`;
      if (known) {
        (page.querySelector("b") as HTMLElement).textContent = species.name;
        (page.querySelector("p") as HTMLElement).textContent = species.line;
        const fact = species.fact ? factById(species.fact) : undefined;
        if (fact?.citation) {
          const line = document.createElement("p");
          line.className = "field-guide-fact";
          line.textContent = `${fact.text} Source: ${fact.citation.publisher}, ${fact.citation.year}.`;
          page.appendChild(line);
        }
      }
      this.grid.appendChild(page);
    }
    // Section 25.1: each defence's pro and con, as game rules, from the game's own data.
    const defences = this.backdrop.querySelector(".field-guide-defences") as HTMLElement;
    defences.innerHTML = "";
    // Section 30.11 bug 7: what side by side does, in the game's plain words.
    const together = Object.values(COMBO_INFO).map((info) => ({ id: "combo", name: "Side by side", text: comboNote(info), source: COMBO_SOURCE }));
    // Section 34b (owner decision): where the wind reaches, from the same rule the Sources screen lists.
    const windReach = factById("wind-reach")?.text;
    const wind = windReach ? [{ id: "wind", name: "The wind", text: `In this game ${windReach.charAt(0).toLowerCase()}${windReach.slice(1)}` }] : [];
    const rules: { id: string; name: string; text: string; source?: string }[] = [...defenceRules(), { id: "broken", name: "Broken defences", text: BROKEN_RULE }, ...wind, ...together];
    for (const rule of rules) {
      const item = document.createElement("li");
      item.className = "field-guide-defence";
      item.dataset.defence = rule.id;
      item.innerHTML = `<b></b><p></p>`;
      (item.querySelector("b") as HTMLElement).textContent = rule.name;
      (item.querySelector("p") as HTMLElement).textContent = rule.text;
      // Section 34b.7: a game rule with a real world fact behind it says so, with its source.
      const fact = rule.source ? factById(rule.source) : undefined;
      if (fact?.citation) {
        const line = document.createElement("p");
        line.className = "field-guide-fact";
        line.textContent = `${fact.text} Source: ${fact.citation.publisher}, ${fact.citation.year}.`;
        item.appendChild(line);
      }
      defences.appendChild(item);
    }
    const list = this.backdrop.querySelector(".field-guide-notes") as HTMLElement;
    (this.backdrop.querySelector(".field-guide-notes-count") as HTMLElement).textContent = this.notes.length === 0 ? "None yet: Maya's tips land here." : "";
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

  /** Esc closes the open guide (and only that: the level's own Esc does not see it). */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.isOpen) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.close();
  };

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey, true);
    window.clearTimeout(this.toastTimer);
    this.button.remove();
    this.backdrop.remove();
    this.toast.remove();
  }
}
