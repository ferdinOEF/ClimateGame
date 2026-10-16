import type { ActionRun } from "@core/actionRun";
import type { AxialCoord } from "@core/hex";
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
  /** A gentle, cancellable camera glide to a tile. */
  focus: (coord: AxialCoord) => void;
  landmarks: readonly { name: string; q: number; r: number }[];
  /** The Tutorial (Section 15): no hello, tips or warnings; the controller says its own coaching lines. */
  quiet?: boolean;
}

type Note = { id: string; title: string; text: string };

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

export class MayaDirector {
  private lastSpokenMoment = -1;
  private readonly warned = new Set<string>();
  private readonly lastCalled = new Set<string>();

  constructor(private readonly maya: Maya, private readonly ctx: DirectorContext) {
    if (ctx.quiet) return;
    // Her first line: the first storm's objective, when there is one (Section 6.3); else hello.
    const job = ctx.run.prep.find((j) => j.heading);
    const next = ctx.run.nextChallenge();
    if (job && next && job.challengeId === next.id) {
      const text = openingLine(job.heading!, stormWord(next.kind));
      this.maya.say({ id: MAYA.opening.id, text, state: "greeting" });
      GUIDE_NOTES.set(MAYA.opening.id, { id: MAYA.opening.id, title: MAYA.opening.title, text });
    } else this.say(MAYA.greeting, "greeting");
  }

  private say(note: Note, state: MayaState, extra: Partial<MayaLine> = {}): void {
    this.maya.say({ id: note.id, text: note.text, state, ...extra });
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
      const hotspot = riskHotspot(exposure.housesAtRisk, exposure.intensity);
      const place = hotspot ? placeName(coordOf(hotspot.key), this.ctx.landmarks, run.zones?.zoneOf(hotspot.key) ?? null) : null;

      // When the heat first appears in this storm's phase: one line, where
      // the most homes are at risk and what to do. Quiet if none are.
      if (!this.warned.has(next.id) && !this.lastCalled.has(next.id) && hotspot && place) {
        this.warned.add(next.id);
        const coord = coordOf(hotspot.key);
        this.maya.say({
          id: `warn:${next.id}`,
          text: warningLine("exposed", place, next.kind),
          state: "warning",
          urgent: true,
          onShow: () => this.ctx.focus(coord)
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
            text: warningLine("lastCall", place, next.kind, exposure.housesAtRisk.length),
            state: "warning",
            urgent: true,
              onShow: () => this.ctx.focus(coord)
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
    const line = this.maya.peek();
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
    if (this.maya.next()) this.lastSpokenMoment = moment;
  }

  /** A note reopened from the Field Guide: said at once, whatever the moment. */
  replay(note: Note): void {
    this.maya.dismiss();
    this.maya.say({ id: note.id, text: note.text, state: "tip", force: true, urgent: true });
    this.maya.next();
  }
}
