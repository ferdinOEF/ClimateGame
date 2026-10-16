import { discoveryFacts, discoveryTotal, displayText, factById, isShown, shortCredit, type Fact } from "@core/facts";
import type { Maya, MayaLine } from "./panjim/maya";

/** Every distinct fact Maya can say on a build (nuggets.json lists them by id; facts.json holds them). Never hardcoded. */
const TOTAL_FACTS = discoveryTotal();

/**
 * The elements Maya is wary of: she says their facts in her worried state,
 * the rest in her neutral "tip" state.
 */
const CAUTION_IDS = new Set(["beachside_resort", "sand_mining", "yacht"]);

/**
 * Fisher-Yates, optionally avoiding a given first element — used when
 * reshuffling after exhausting a pick order, so the new shuffle's first
 * fact can never immediately repeat whatever was just shown last.
 */
function shuffledIndices(n: number, avoidFirst?: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (avoidFirst !== undefined && n > 1 && arr[0] === avoidFirst) {
    const swapWith = 1 + Math.floor(Math.random() * (n - 1));
    [arr[0], arr[swapWith]] = [arr[swapWith], arr[0]];
  }
  return arr;
}

/**
 * STEP_PROMPT_knowledge_nuggets.md Part C, as Section 1d left it: the moment
 * a player successfully builds one of the ten nugget-eligible elements, this
 * picks which of that element's facts to tell (a cited fact, or a rule of
 * this game) and hands it to Maya, who says it in her speech bubble: there is
 * no card of its own. Maya's queue decides when (one line at a time, never
 * mid-build or over a modal, each line once per session, behind any hazard
 * warning), and her bubble carries the running "N of M" count and the
 * Source button.
 *
 * `house` deliberately has no entry in nuggets.json, so `show()` no-ops for
 * it (and for any future element added without nuggets yet). With no Maya (the
 * Tutorial, where its coach is the one voice) it also no-ops.
 */
export class NuggetPopup {
  /** Per-element shuffle state — a fresh shuffle on first build of that type, reshuffled (never immediately repeating) once exhausted. */
  private pickState = new Map<string, { order: number[]; cursor: number }>();
  /** Fact ids Maya has said — a Set, so the same fact said again does not count twice. */
  private discovered = new Set<string>();

  /** Where her count comes from (Section 13: the Field Guide's one count); null keeps the facts tally. */
  progressText: ((factId: string) => string) | null = null;

  constructor(private readonly maya: Maya | null) {}

  /** "2 of 21": how many of the facts she can say have been said. */
  get progress(): string {
    return `${this.discovered.size} of ${TOTAL_FACTS}`;
  }

  /**
   * No-ops silently if elementId has no entry in nuggets.json. `factId`
   * picks a particular fact (the layout test shows the tallest); otherwise
   * the next one in this element's shuffle.
   */
  show(elementId: string, factId?: string): void {
    const facts = discoveryFacts(elementId);
    if (!facts || facts.length === 0) return;
    const chosen = factId ? facts.findIndex((fact) => fact.id === factId) : -1;
    if (chosen >= 0) {
      this.offer(elementId, facts[chosen]);
      return;
    }

    let state = this.pickState.get(elementId);
    if (!state || state.cursor >= state.order.length) {
      const avoidFirst = state ? state.order[state.order.length - 1] : undefined;
      state = { order: shuffledIndices(facts.length, avoidFirst), cursor: 0 };
      this.pickState.set(elementId, state);
    }
    const factIndex = state.order[state.cursor];
    state.cursor++;

    this.offer(elementId, facts[factIndex]);
  }

  /** Says a fact again, at once (reopened from the Field Guide). False if `id` is not a fact she can say. */
  replay(id: string): boolean {
    const fact = factById(id);
    if (!fact || !isShown(fact) || !this.maya) return false;
    this.maya.dismiss();
    this.maya.say({ ...this.line(fact.elements[0] ?? "", fact), force: true, urgent: true });
    this.maya.next();
    return true;
  }

  /** The line Maya says for a fact: first person, in her tip state (worried for the elements she is wary of). */
  private line(elementId: string, fact: Fact): MayaLine {
    return {
      id: fact.id,
      text: displayText(fact),
      state: CAUTION_IDS.has(elementId) ? "worried" : "tip",
      urgent: false,
      rule: fact.kind === "gameRule",
      fact: { id: fact.id, credit: fact.citation ? shortCredit(fact.citation) : undefined, progress: () => (this.progressText ? this.progressText(fact.id) : this.progress) },
      onShow: () => this.discovered.add(fact.id)
    };
  }

  private offer(elementId: string, fact: Fact): void {
    this.maya?.say(this.line(elementId, fact));
  }

  /** Same "doesn't need to persist across a reset" convention as HazardTestPanel.reset() — clears the per-element pick-order state and the count back to zero. */
  reset(): void {
    this.pickState.clear();
    this.discovered.clear();
  }
}
