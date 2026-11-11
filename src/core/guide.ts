import { MAYA, fill } from "./mayaLines";
import type { ActionRun } from "./actionRun";

/**
 * Section 39.4 (owner decision): the guided start. Once per Play Panjim run, right after "Let's Play!", in the first
 * year with no builds yet (never after Restart or a retry, never in the Tutorial), Maya walks the player through two
 * builds by hand: the 2026 objective's dune pick, then its first pandanus pick.
 *
 * Section 41.5: since the first cyclone is 1.15 (Section 41.3) the model's 2026 objective is two pandanus and no dune.
 * The guide keeps its two builds and its words: where the objective has no dune pick, the dune goes on the tile of
 * the objective's own place where a dune takes the most homes out of the storm's risk (`guideDune`), never on one of
 * its pandanus picks, so the objective can still be done with the builds that are left.
 *
 * A soft guide: it never blocks input. A click elsewhere still works and the guide waits; a build other than the guided
 * one, or "Skip the help", jumps it to its last bubble (step 3), whose Got it ends it.
 *
 *   1   the dune tile glows: "Click the glowing tile."
 *   1b  its build menu is open: "Pick Dune." (closing the menu goes back to 1)
 *   2   the dune is built; the pandanus tile glows
 *   2b  its build menu is open: "Pick Pandanus." (closing it goes back to 2)
 *   3   the dim lifts: "Over to you", Got it
 *
 * Pure: no DOM, no renderer.
 */
export type GuideStep = "1" | "1b" | "2" | "2b" | "3" | "done";

/** A guided build: a tile ("q,r") and the defense to build there. */
export interface GuideTile {
  key: string;
  elementId: string;
}

/**
 * The two guided builds from the objective's picks: its first dune pick, then its first pandanus pick. `fallbackDune`
 * (Section 41.5, `guideDune`) stands in where the objective has no dune pick. Null without both: no guide.
 */
export function guideTiles(picks: readonly GuideTile[], fallbackDune: GuideTile | null = null): [GuideTile, GuideTile] | null {
  const dune = picks.find((p) => p.elementId === "dune") ?? fallbackDune;
  const pandanus = picks.find((p) => p.elementId === "sandy_vegetation" && p.key !== dune?.key);
  return dune && pandanus ? [{ key: dune.key, elementId: "dune" }, { key: pandanus.key, elementId: pandanus.elementId }] : null;
}

/**
 * Section 41.5: the guided dune where the objective asks for none: of the tiles the next storm's objective rows pulse
 * (the place they name), not one of the objective's own picks, the one where a dune takes the most homes out of that
 * storm's risk, by the same model as the build cards and Homes at risk (`ActionRun.homesSavedBy`); ties go to the
 * first tile in key order. Null when no dune there saves a home.
 */
export function guideDune(run: Pick<ActionRun, "prep" | "objective" | "nextChallenge" | "homesSavedBy">): GuideTile | null {
  const next = run.nextChallenge();
  if (!next) return null;
  const picks = new Set((run.objective?.picks ?? []).map((p) => p.key));
  const tiles = [...new Set(run.prep.filter((row) => row.challengeId === next.id).flatMap((row) => row.tiles ?? []))].filter((key) => !picks.has(key)).sort();
  let best: { key: string; saves: number } | null = null;
  for (const key of tiles) {
    const [q, r] = key.split(",").map(Number);
    const saves = run.homesSavedBy(next, { q, r }, "dune") ?? 0;
    if (saves > 0 && (!best || saves > best.saves)) best = { key, saves };
  }
  return best ? { key: best.key, elementId: "dune" } : null;
}

/** Whether the guide runs: Play Panjim (never the Tutorial), a fresh run (not a Restart), its first year, no builds yet. */
export function guideShouldRun(run: { tutorial: boolean; restarted: boolean; turnNumber: number; builds: number }): boolean {
  return !run.tutorial && !run.restarted && run.turnNumber === 1 && run.builds === 0;
}

export class GuideMachine {
  private current: GuideStep = "1";

  constructor(
    readonly first: GuideTile,
    readonly second: GuideTile
  ) {}

  get step(): GuideStep {
    return this.current;
  }

  /** Until step 3's Got it. */
  get active(): boolean {
    return this.current !== "done";
  }

  /** Steps 1 to 2b: the map is dimmed round the glowing tile. */
  get dimmed(): boolean {
    return this.current === "1" || this.current === "1b" || this.current === "2" || this.current === "2b";
  }

  /** The tile that glows (and whose card is picked), or null at step 3. */
  get target(): GuideTile | null {
    if (this.current === "1" || this.current === "1b") return this.first;
    if (this.current === "2" || this.current === "2b") return this.second;
    return null;
  }

  /** The build menu is open on `key` (null: no build menu is open). Opening it on the glowing tile goes on; closing it goes back. */
  menu(key: string | null): void {
    const target = this.target;
    if (!target) return;
    const onTarget = key === target.key;
    if (this.current === "1" && onTarget) this.current = "1b";
    else if (this.current === "1b" && !onTarget) this.current = "1";
    else if (this.current === "2" && onTarget) this.current = "2b";
    else if (this.current === "2b" && !onTarget) this.current = "2";
  }

  /** A build went down. The guided one goes on; anything else ends the guide at step 3. */
  built(key: string, elementId: string): void {
    const target = this.target;
    if (!target) return;
    const guided = key === target.key && elementId === target.elementId;
    if (guided && target === this.first) this.current = "2";
    else this.current = "3";
  }

  /** "Skip the help": straight to step 3. */
  skip(): void {
    if (this.dimmed) this.current = "3";
  }

  /** Step 3's Got it (or its line closing any other way): the guide ends. */
  gotIt(): void {
    if (this.current === "3") this.current = "done";
  }
}

/** Maya's bubble for a step: the text, the bold line under it, and the step number in the footer (none at step 3). */
export function guideLine(step: GuideStep, values: { year: number; builds: number; name: string }): { text: string; bold: string; at: number | null } {
  const g = MAYA.guide;
  const pick = fill(g.pickBold, { name: values.name });
  switch (step) {
    case "1":
      return { text: fill(g.step1, { year: values.year }), bold: g.step1Bold, at: 1 };
    case "1b":
      return { text: g.step1b, bold: pick, at: 1 };
    case "2":
      return { text: g.step2, bold: g.step2Bold, at: 2 };
    case "2b":
      return { text: g.step2b, bold: pick, at: 2 };
    default:
      return { text: fill(g.step3, { n: values.builds }), bold: g.step3Bold, at: null };
  }
}
