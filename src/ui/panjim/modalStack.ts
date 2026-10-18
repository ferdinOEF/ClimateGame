/**
 * The one small modal manager (Section 16 B5). Every layer the player can
 * open over the board is listed here, topmost first, so there is one answer
 * to "what is on top": Esc and a press outside close that layer only, the
 * "Leave Panjim?" prompt opens only when nothing is open, and a storm waits
 * until Help and ☰ (and the Field Guide, a confirm, Sources) are shut.
 *
 * A layer that answers its own Esc (the confirm, the result cards, the Field
 * Guide, ☰) has no `close` here: its own handler runs first and marks the key
 * handled. The rest (Help, the build menu) are closed by `escape()`. A layer
 * with neither (the start popup) simply holds Esc: nothing under it reacts.
 * No DOM in here, so the order and the rules can be tested in Node.
 */
export interface ModalLayer {
  name: string;
  isOpen(): boolean;
  /** Closes the layer on Esc; absent when the layer answers Esc itself, or holds it. */
  close?: () => void;
}

export class ModalStack {
  /** Topmost first. */
  constructor(private readonly layers: readonly ModalLayer[]) {}

  topmost(): ModalLayer | null {
    return this.layers.find((layer) => layer.isOpen()) ?? null;
  }

  /** True when `name` is open and nothing above it is. */
  isTopmost(name: string): boolean {
    return this.topmost()?.name === name;
  }

  anyOpen(): boolean {
    return this.topmost() !== null;
  }

  /** Any of the named layers open (a storm waits for Help and ☰). */
  someOpen(names: readonly string[]): boolean {
    return this.layers.some((layer) => names.includes(layer.name) && layer.isOpen());
  }

  /**
   * Esc: closes the topmost layer and nothing else. Returns "closed" when it
   * closed one, "held" when the topmost layer keeps the key (it answers Esc
   * itself, or ignores it), and "none" when nothing is open.
   */
  escape(): "closed" | "held" | "none" {
    const top = this.topmost();
    if (!top) return "none";
    if (!top.close) return "held";
    top.close();
    return "closed";
  }
}

/** The layers a storm waits for (Section 16 B5): it never starts, and its cards never open, under them. */
export const STORM_WAITS_FOR: readonly string[] = ["help", "menu", "field-guide", "leave", "sources"];

/** The line under "Leave Panjim?" (Section 16 B5): what is true of the run right now. */
export function leaveText(run: { tutorial: boolean; savedYear: number | null; finished: boolean; builds: number }): string {
  if (run.tutorial) return "The Tutorial is not saved: leaving starts it again.";
  if (run.savedYear !== null) return `Your run is saved. You can continue from ${run.savedYear}.`;
  if (run.finished) return "This run is over, and its result is recorded.";
  // Built, yet nothing saved: this browser keeps no storage for the game.
  if (run.builds > 0) return "This browser could not save your run, so leaving ends it.";
  return "You haven't built anything yet.";
}
