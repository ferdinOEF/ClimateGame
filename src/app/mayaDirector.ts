import type { ActionRun } from "@core/actionRun";
import type { AxialCoord } from "@core/hex";
import type { Exposure } from "@core/exposure";
import { MAYA, placeName, riskHotspot, warningLine } from "@core/mayaLines";
import type { Maya, MayaLine, MayaState } from "@ui/panjim/maya";

/**
 * When Maya speaks, and what about. The rules that keep her helpful rather
 * than chatty:
 *
 *   - at most one line per quarter, and a quarter's rest between ordinary
 *     tips (warnings skip the rest, never the one-per-quarter limit);
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
}

type Note = { id: string; title: string; text: string };

const TIPS = new Map<string, Note>(MAYA.tips.map((tip) => [tip.id, tip]));
const VOICES: Note[] = MAYA.voices;
/** Every line that becomes a Field Guide page, by id. Warnings are situational and are not kept. */
export const GUIDE_NOTES = new Map<string, Note>([[MAYA.greeting.id, MAYA.greeting], ...TIPS, ...VOICES.map((voice) => [voice.id, voice] as [string, Note])]);

/** The tips that answer each kind of storm, in the order she gives them. */
const TIPS_FOR: Record<string, string[]> = {
  cyclone: ["dunes", "mangroves"],
  flood: ["khazans", "mangroves"],
  compound: ["mangroves", "khazans", "dunes"]
};

function coordOf(key: string): AxialCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

export class MayaDirector {
  private lastSpokenQuarter = -1;
  private lastVoiceQuarter = -99;
  private voiceIndex = 0;
  private readonly warned = new Set<string>();
  private readonly lastCalled = new Set<string>();

  constructor(private readonly maya: Maya, private readonly ctx: DirectorContext) {
    this.say(MAYA.greeting, "greeting");
  }

  private say(note: Note, state: MayaState, extra: Partial<MayaLine> = {}): void {
    this.maya.say({ id: note.id, text: note.text, state, ...extra });
  }

  /** A tip by id (also used by the Get ready panel). */
  tip(id: string, state: MayaState = "tip"): void {
    const note = TIPS.get(id);
    if (note) this.say(note, state);
  }

  /** After anything that changed the board or the clock: queue what this moment calls for. */
  consider(): void {
    const run = this.ctx.run;
    const next = run.nextChallenge();
    if (!next) return;
    const quartersLeft = run.quartersUntil(next);
    const exposure = this.ctx.exposure();

    // Tips about the storm that is coming, once it is within three years.
    if (quartersLeft <= 12) for (const id of TIPS_FOR[next.kind] ?? []) this.tip(id, id === "khazans" ? "explains" : "tip");
    // Anything engineered on the board earns the seawall tip.
    for (const inst of run.state.elements.values()) {
      if (inst.elementId === "seawall" || inst.elementId === "breakwater") {
        this.tip("seawall", "explains");
        break;
      }
    }

    if (exposure && quartersLeft >= 1 && quartersLeft <= 5) {
      this.tip("heat", "explains");
      const defended = [...run.state.elements.values()].some((inst) => ["dune", "sandy_vegetation", "mangrove", "khazan", "seawall", "breakwater", "small_dam"].includes(inst.elementId));
      if (defended) this.tip("shields", "tip");
      const hotspot = riskHotspot(exposure.housesAtRisk, exposure.intensity);
      const place = hotspot ? placeName(coordOf(hotspot.key), this.ctx.landmarks, run.zones?.zoneOf(hotspot.key) ?? null) : null;

      // Three quarters out (or the first look inside three, after a skip):
      // hop to where the most homes are at risk and say so. Quiet if none are.
      if (quartersLeft <= 3 && quartersLeft >= 2 && !this.warned.has(next.id) && hotspot && place) {
        this.warned.add(next.id);
        const coord = coordOf(hotspot.key);
        this.maya.say({
          id: `warn:${next.id}`,
          text: warningLine("exposed", place, next.kind),
          state: "warning",
          urgent: true,
          anchor: () => this.ctx.project(coord),
          onShow: () => this.ctx.focus(coord)
        });
      }
      // The last quarter: a last call if homes are still at risk, a cheer if
      // the warned place was fixed.
      if (quartersLeft === 1 && !this.lastCalled.has(next.id)) {
        this.lastCalled.add(next.id);
        this.maya.withdraw((line) => line.id === `warn:${next.id}`);
        if (hotspot && place) {
          const coord = coordOf(hotspot.key);
          this.maya.say({
            id: `last:${next.id}`,
            text: warningLine("lastCall", place, next.kind, exposure.housesAtRisk.length),
            state: "warning",
            urgent: true,
            anchor: () => this.ctx.project(coord),
            onShow: () => this.ctx.focus(coord)
          });
        } else if (this.warned.has(next.id)) {
          this.maya.say({ id: `fixed:${next.id}`, text: warningLine("fixed", this.lastPlace ?? "Panjim", next.kind), state: "celebrates", urgent: true });
        }
      }
      if (place) this.lastPlace = place;
    }

    // Now and then, when nothing more pressing is waiting, a voice from the
    // city. Never once a forecast has locked: the run-up to a storm is for
    // the warnings.
    if (this.maya.pending === 0 && quartersLeft > 8 && run.quarter >= 2 && run.quarter - this.lastVoiceQuarter >= 6 && this.voiceIndex < VOICES.length) {
      this.say(VOICES[this.voiceIndex++], "tip");
      this.lastVoiceQuarter = run.quarter;
    }
  }

  private lastPlace: string | null = null;

  /** Called a few times a second: lets her say the next queued line if she may. */
  pump(): void {
    if (this.maya.isMuted || this.ctx.blocked()) return;
    const quarter = this.ctx.run.quarter;
    const line = this.maya.peek();
    if (!line) return;
    if (quarter === this.lastSpokenQuarter) return;
    // A warning does not wait behind a line left over from an earlier
    // quarter: it replaces it. (Still never two lines in one quarter.)
    if (this.maya.speaking) {
      if (!line.urgent) return;
      this.maya.dismiss();
    }
    if (!line.urgent && this.lastSpokenQuarter >= 0 && quarter - this.lastSpokenQuarter < 2) return;
    if (this.maya.next()) this.lastSpokenQuarter = quarter;
  }

  /** A note reopened from the Field Guide: said at once, whatever the quarter. */
  replay(note: Note): void {
    this.maya.dismiss();
    this.maya.say({ id: note.id, text: note.text, state: "tip", force: true, urgent: true });
    this.maya.next();
  }
}
