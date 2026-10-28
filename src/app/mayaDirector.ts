import type { ActionRun } from "@core/actionRun";
import { axialDistance as hexDistance, type AxialCoord } from "@core/hex";
import type { Exposure } from "@core/exposure";
import { MAYA, openingLine, placeName, riskHotspot, stormWord, warningLine } from "@core/mayaLines";
import type { Maya, MayaLine, MayaState } from "@ui/panjim/maya";

/**
 * When Maya speaks, and what about. The rules that keep her helpful rather
 * than chatty:
 *
 *   - at most one line per moment (each build, repair or demolition, and
 *     each new year, is a moment), and a moment's rest between ordinary
 *     tips (warnings skip the rest, never the one-per-moment limit;
 *     discoveries, the fact about what was just built, skip it too and go
 *     ahead of ordinary tips, never ahead of a warning);
 *   - never while a time-lapse or a storm plays, never while the build menu
 *     or any card is open (`blocked`);
 *   - each line once per session (the Field Guide can replay it);
 *   - the player can dismiss any line (Got it / Esc) and mute her (M).
 *
 * What she says comes from the game's own state: the next storm, its
 * exposure (the same numbers as the warning heat), what is built.
 */
export interface DirectorContext {
  run: ActionRun;
  /** The next storm's exposure while it is inside the warning window, else null. */
  exposure: () => Exposure | null;
  /** True while she must stay quiet: a time-lapse, a storm, the build menu, a card. */
  blocked: () => boolean;
  /** A board tile on screen, in container pixels; null if off screen. */
  project: (coord: AxialCoord) => { x: number; y: number } | null;
  /** Section 34b.3: Last call's camera move, to a tile, with the tiles to keep clear of the HUD card and Maya. */
  focus: (coord: AxialCoord, tiles?: readonly AxialCoord[]) => void;
  landmarks: readonly { name: string; q: number; r: number }[];
  /** The Tutorial (Section 15): no hello, tips or warnings; the controller says its own coaching lines. */
  quiet?: boolean;
}

type Note = { id: string; title: string; text: string; rule?: boolean };

const TIPS = new Map<string, Note>(MAYA.tips.map((tip) => [tip.id, tip]));
/** Every line that becomes a Field Guide page, by id. Warnings are situational and are not kept. */
export const GUIDE_NOTES = new Map<string, Note>([[MAYA.greeting.id, MAYA.greeting], ...TIPS]);

/** The tips that answer each kind of storm, in the order she gives them. */
const TIPS_FOR: Record<string, string[]> = {
  cyclone: ["dunes", "mangroves"],
  flood: ["khazans", "mangroves"],
  compound: ["mangroves", "khazans", "dunes"]
};

/** A tip about one kind of storm that does not answer the storm coming now (Section 12): withdrawn when a phase ends. */
export function staleTip(id: string, nextKind: string): boolean {
  return Object.values(TIPS_FOR).some((ids) => ids.includes(id)) && !(TIPS_FOR[nextKind] ?? []).includes(id);
}

function coordOf(key: string): AxialCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/** Section 34b.2: a fact or a tip, which she gives at most one a year and never twice in a run. */
export function isTip(line: MayaLine): boolean {
  return !!line.fact || TIPS.has(line.id);
}

/** "Back at 2026. 5 builds before the cyclone." (a retry) and "On to 2031. 10 builds before the flood." (a phase start). */
export function phaseLine(retry: boolean, year: number, builds: number, kind: string): string {
  return `${retry ? "Back at" : "On to"} ${year}. ${builds} ${builds === 1 ? "build" : "builds"} before the ${stormWord(kind as Parameters<typeof stormWord>[0])}.`;
}

export class MayaDirector {
  private lastSpokenMoment = -1;
  private readonly warned = new Set<string>();
  private readonly lastCalled = new Set<string>();
  /** Section 34b.2: the facts and tips said this run (kept on a retry, which is the same run), and the year of the last. */
  readonly shownTips = new Set<string>();
  private tipYear: number | null = null;

  constructor(private readonly maya: Maya, private readonly ctx: DirectorContext) {
    if (ctx.quiet) return;
    // Her first line: the first storm's objective, when there is one (Section 6.3); else hello.
    const job = ctx.run.prep.find((j) => j.heading && j.challengeId === ctx.run.prepConfig?.opening?.challengeId);
    const next = ctx.run.nextChallenge();
    if (job && next && job.challengeId === next.id) {
      const text = openingLine(job.heading!, stormWord(next.kind));
      this.maya.say({ id: MAYA.opening.id, text, state: "greeting" });
      GUIDE_NOTES.set(MAYA.opening.id, { id: MAYA.opening.id, title: MAYA.opening.title, text });
    } else this.say(MAYA.greeting, "greeting");
  }

  private say(note: Note, state: MayaState, extra: Partial<MayaLine> = {}): void {
    // Section 34: a rule tip keeps its "Game rule" tag (it was dropped here, so the tips read as plain claims).
    this.maya.say({ id: note.id, text: note.text, state, ...(note.rule ? { rule: true } : {}), ...extra });
  }

  /** A tip by id (also used by the Get ready panel). */
  tip(id: string, state: MayaState = "tip"): void {
    if (this.ctx.quiet) return;
    const note = TIPS.get(id);
    if (note) this.say(note, state);
  }

  /** After anything that changed the board or the clock: queue what this moment calls for. */
  consider(): void {
    if (this.ctx.quiet) return;
    const run = this.ctx.run;
    const next = run.nextChallenge();
    if (!next) return;
    const yearsLeft = run.yearsUntil(next);
    const exposure = this.ctx.exposure();

    // Tips about the storm that is coming, once it is within three years.
    if (yearsLeft <= 3) for (const id of TIPS_FOR[next.kind] ?? []) this.tip(id, id === "khazans" ? "explains" : "tip");
    // Anything engineered on the board earns the seawall tip.
    for (const inst of run.state.elements.values()) {
      if (inst.elementId === "seawall" || inst.elementId === "breakwater") {
        this.tip("seawall", "explains");
        break;
      }
    }

    if (exposure && yearsLeft >= 1 && yearsLeft <= 2) {
      // Section 34: "strengthen it now" pointed at homes no build could help. While the objective has open rows, she
      // names the homes at risk near its tiles still to build (where a build does help); otherwise all of them.
      const zones = run.zones;
      // The open tiles are those where a build still saves homes from this storm (the same model as Homes at risk), and
      // then the line says so ("homes there can still be saved") rather than "most at risk", which may not be true.
      const openPicks = zones ? (run.objective?.picks ?? []).filter((pick) => run.state.canBuild(coordOf(pick.key), pick.elementId) && (run.riskChangeBy(next, coordOf(pick.key), pick.elementId)?.saved.length ?? 0) > 0).map((pick) => coordOf(pick.key)) : [];
      const nearPicks = exposure.housesAtRisk.filter((key) => openPicks.some((pick) => hexDistance(pick, coordOf(key)) <= 3));
      const helpful = nearPicks.length > 0;
      const hotspot = riskHotspot(helpful ? nearPicks : exposure.housesAtRisk, exposure.intensity);
      const place = hotspot ? placeName(coordOf(hotspot.key), this.ctx.landmarks, run.zones?.zoneOf(hotspot.key) ?? null) : null;

      // When the heat first appears in this storm's phase: one line, where
      // the most homes are at risk and what to do. Quiet if none are. (Section 34b.3: no camera move of its own; the
      // heat coming on has moved it to the hot tiles.)
      if (!this.warned.has(next.id) && !this.lastCalled.has(next.id) && hotspot && place) {
        this.warned.add(next.id);
        this.maya.say({
          id: `warn:${next.id}`,
          // Section 34b.13: before the 2050 storm (cyclone and flood), a word about its wind.
          text: warningLine(helpful ? "exposedHelp" : "exposed", place, next.kind) + (next.kind === "compound" ? ` ${MAYA.warning.wind}` : ""),
          state: "warning",
          urgent: true
        });
      }
      // The storm's own year: a last call if homes are still at risk, a cheer
      // if the warned place was fixed.
      if (yearsLeft === 1 && !this.lastCalled.has(next.id)) {
        this.lastCalled.add(next.id);
        this.maya.withdraw((line) => line.id === `warn:${next.id}`);
        if (hotspot && place) {
          const coord = coordOf(hotspot.key);
          this.maya.say({
            id: `last:${next.id}`,
            text: warningLine(helpful ? "lastCallHelp" : "lastCall", place, next.kind, exposure.housesAtRisk.length),
            state: "warning",
            urgent: true,
            onShow: () => this.ctx.focus(coord, [coord, ...exposure.housesAtRisk.map(coordOf).filter((h) => hexDistance(h, coord) <= 2)])
          });
        } else if (this.warned.has(next.id)) {
          this.maya.say({ id: `fixed:${next.id}`, text: warningLine("fixed", this.lastPlace ?? "Panjim", next.kind), state: "celebrates", urgent: true });
        }
      }
      if (place) this.lastPlace = place;
    }
  }

  private lastPlace: string | null = null;

  /** Called a few times a second: lets her say the next queued line if she may. */
  pump(): void {
    if (this.maya.isMuted || this.ctx.blocked()) return;
    const moment = this.ctx.run.moment;
    const year = this.ctx.run.year;
    // Section 34b.2: a fact or tip already said this run is not said again; at most one a year (the lines behind a
    // held tip, a warning or her objective line, may go first).
    this.maya.withdraw((queued) => isTip(queued) && !queued.force && this.shownTips.has(queued.id));
    const allowed = (queued: MayaLine): boolean => queued.force === true || !isTip(queued) || this.tipYear !== year;
    const line = this.maya.queued.find(allowed);
    if (!line) return;
    if (moment === this.lastSpokenMoment) return;
    // A warning does not wait behind a line left over from an earlier
    // moment: it replaces it. (Still never two lines in one moment.)
    if (this.maya.speaking) {
      if (!line.urgent) return;
      this.maya.dismiss();
    }
    // Ordinary tips rest two moments between them; a discovery is news about what was just built, so it does not wait out that rest.
    if (!line.urgent && !line.fact && this.lastSpokenMoment >= 0 && moment - this.lastSpokenMoment < 2) return;
    if (this.maya.next((queued) => queued === line)) {
      this.lastSpokenMoment = moment;
      // A line held back for want of room (Maya puts it back in her queue) has not been said yet.
      if (isTip(line) && this.maya.currentLine === line) {
        this.shownTips.add(line.id);
        this.tipYear = year;
      }
    }
  }

  /**
   * Section 34b.2: a phase's first line, after the storm before it ("On to 2031. 10 builds before the flood."), or
   * after "Try this storm again" ("Back at 2026. 5 builds before the cyclone."). It goes ahead of every tip; a retry
   * also drops every tip still waiting, and whatever she was saying.
   */
  phaseStart(retry: boolean): void {
    if (this.ctx.quiet) return;
    const run = this.ctx.run;
    const next = run.nextChallenge();
    if (!next) return;
    if (retry) {
      this.maya.withdraw((queued) => isTip(queued));
      this.maya.dismiss();
    }
    this.maya.say({ id: `phase:${next.id}:${run.moment}`, text: phaseLine(retry, run.year, run.buildsUntil(next), next.kind), state: "explains", urgent: true, force: true });
  }

  /** A note reopened from the Field Guide: said at once, whatever the moment. */
  replay(note: Note): void {
    this.maya.dismiss();
    this.maya.say({ id: note.id, text: note.text, state: "tip", force: true, urgent: true });
    this.maya.next();
  }
}
