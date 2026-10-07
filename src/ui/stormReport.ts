/**
 * What the storm did, and why.
 *
 * WHY A WHOLE PANEL FOR THIS
 *
 * The game's argument is that a living coast takes the violence out of a
 * surge. Everything needed to make that argument was already being computed —
 * the resolver tallies exactly how much energy each defence family removed
 * from the wave — and none of it was ever shown. A player saw tiles flash red
 * and a one-line banner of deltas, from which they were expected to infer a
 * physical claim about mangroves. Nobody infers that.
 *
 * So this says it outright, in the only form that is persuasive: the real
 * numbers from the run that just happened. Not a tooltip explaining what
 * mangroves do in general, but "your mangroves took 41% out of this wave, and
 * the 38% that got through is why those three houses are leaning."
 *
 * HONESTY RULES THIS FILE
 *
 * Every figure comes from `HazardResult`, which is the same arithmetic that
 * produced the damage on screen. Nothing here estimates, models or rounds in
 * the game's favour. The takeaway line is chosen from what actually happened,
 * so a player who built nothing is told they built nothing, and a player
 * whose seawall failed is told what a failing wall does — including when that
 * is the less flattering reading.
 */

export interface StormReportData {
  /** "Storm Surge" or "Flood". */
  kind: string;
  /** Share of arriving energy each defence family removed, keyed by category. Already normalised to 0-1. */
  absorbedByCategory: Map<string, number>;
  /** Share that reached tiles with nothing standing on them, 0-1. */
  unprotectedShare: number;
  /** Buildings that crossed the damage threshold this event. */
  buildingsDamaged: number;
  /** Defences destroyed outright — engineered structures that breached. */
  defencesLost: number;
  /** Living defences that were overwhelmed but survived. */
  defencesOverwhelmed: number;
  /** True when the player has no nature-based defence standing anywhere. */
  hasNoNatureDefences: boolean;
}

interface Row {
  label: string;
  share: number;
  className: string;
}

/** Display names and bar colours per defence family. Keyed by the same `ElementCategory` the elements roster uses. */
const FAMILIES: { category: string; label: string; className: string }[] = [
  { category: "nbs", label: "Mangroves, dunes & pandanus", className: "nbs" },
  { category: "hybrid", label: "Khazan bunds & sluices", className: "hybrid" },
  { category: "engineered", label: "Seawalls, breakwaters & dams", className: "engineered" }
];

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * The one sentence a student should leave with.
 *
 * Ordered by what is most worth saying about THIS storm, not by severity:
 * a lesson about a defence that was not there beats a lesson about one that
 * worked, because the first is the thing the player can act on next turn.
 */
function takeaway(data: StormReportData): { headline: string; body: string } {
  const nbs = data.absorbedByCategory.get("nbs") ?? 0;
  const hybrid = data.absorbedByCategory.get("hybrid") ?? 0;
  const engineered = data.absorbedByCategory.get("engineered") ?? 0;
  const living = nbs + hybrid;

  if (data.defencesLost > 0) {
    return {
      headline: "A wall that fails gives everything back at once",
      body:
        "Concrete holds completely until the moment it does not, and then the water it was holding arrives all together. " +
        "That is the trade: more protection than roots can offer, right up until there is none at all."
    };
  }

  if (data.buildingsDamaged > 0 && data.hasNoNatureDefences) {
    return {
      headline: "Nothing stood between the sea and those homes",
      body:
        "Every bit of this wave arrived with its full energy. Mangroves on the estuary break a surge up in their roots " +
        "before it reaches the shore — plant a belt and watch this number fall."
    };
  }

  if (data.buildingsDamaged > 0 && living > 0) {
    return {
      headline: "Your living defences helped, but the belt is too thin",
      body:
        `Roots took ${percent(living)} out of this wave. The rest came through the gaps. ` +
        "A deeper belt absorbs more, and a mature one absorbs far more than a young one."
    };
  }

  if (living > engineered && living > 0.3) {
    return {
      headline: "The living coast did most of the work",
      body:
        `Mangrove roots and dune grass absorbed ${percent(living)} of this surge by slowing the water through them, ` +
        "rather than bouncing it somewhere else the way a wall does. They also came back after it."
    };
  }

  if (engineered > living && engineered > 0.3) {
    return {
      headline: "Concrete held this one",
      body:
        `Engineered defences took ${percent(engineered)} out of the wave — more than roots could have, today. ` +
        "Watch what happens when a storm arrives bigger than the wall was built for."
    };
  }

  if (data.unprotectedShare > 0.6) {
    return {
      headline: "Most of this coast is still open",
      body:
        `${percent(data.unprotectedShare)} of the wave hit tiles with nothing on them. ` +
        "Anywhere you leave bare is where the next storm will go."
    };
  }

  return {
    headline: "The coast held",
    body: "Nothing was lost this time. Storms get stronger as the season goes on — the belt that held today may not hold the next one."
  };
}

export class StormReport {
  private readonly backdrop: HTMLElement;
  private readonly card: HTMLElement;

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "storm-report-backdrop";
    this.backdrop.hidden = true;

    this.card = document.createElement("div");
    this.card.className = "storm-report";
    this.backdrop.appendChild(this.card);
    container.appendChild(this.backdrop);

    // Dismiss by clicking outside as well as on the button. A modal a player
    // has to aim at is a modal they resent by the fourth storm.
    this.backdrop.addEventListener("click", (event) => {
      if (event.target === this.backdrop) this.hide();
    });
  }

  show(data: StormReportData): void {
    const rows: Row[] = FAMILIES.map((family) => ({
      label: family.label,
      share: data.absorbedByCategory.get(family.category) ?? 0,
      className: family.className
    })).filter((row) => row.share > 0.005);

    const absorbed = rows.reduce((sum, row) => sum + row.share, 0);
    const through = Math.max(0, 1 - absorbed);
    const lesson = takeaway(data);

    this.card.innerHTML = "";

    this.card.appendChild(
      element("div", "storm-report-eyebrow", `${data.kind} — what happened`)
    );

    // The headline figure. Framed as what got through rather than what was
    // stopped, because the damage on the board is what the player is looking
    // at and the number should explain that, not argue with it.
    const summary = element("div", "storm-report-summary");
    summary.appendChild(element("div", "storm-report-big", percent(through)));
    summary.appendChild(
      element(
        "div",
        "storm-report-big-label",
        through > 0 ? "of the wave reached your coast" : "of the wave got through"
      )
    );
    this.card.appendChild(summary);

    if (rows.length > 0) {
      this.card.appendChild(element("div", "storm-report-section-label", "Absorbed before it arrived"));
      for (const row of rows) {
        const line = element("div", "storm-report-row");
        line.appendChild(element("span", "storm-report-row-label", row.label));
        const track = element("span", "storm-report-bar");
        const fill = element("span", `storm-report-bar-fill ${row.className}`);
        fill.style.width = `${Math.round(row.share * 100)}%`;
        track.appendChild(fill);
        line.appendChild(track);
        line.appendChild(element("span", "storm-report-row-value", percent(row.share)));
        this.card.appendChild(line);
      }
    } else {
      this.card.appendChild(
        element("div", "storm-report-nothing", "Nothing absorbed any of it. This coast was undefended.")
      );
    }

    const costs: string[] = [];
    if (data.buildingsDamaged > 0) {
      costs.push(`${data.buildingsDamaged} building${data.buildingsDamaged === 1 ? "" : "s"} damaged`);
    }
    if (data.defencesLost > 0) {
      costs.push(`${data.defencesLost} defence${data.defencesLost === 1 ? "" : "s"} destroyed`);
    }
    if (data.defencesOverwhelmed > 0) {
      costs.push(`${data.defencesOverwhelmed} overwhelmed but still standing`);
    }
    if (costs.length > 0) this.card.appendChild(element("div", "storm-report-costs", costs.join(" · ")));

    const lessonBlock = element("div", "storm-report-lesson");
    lessonBlock.appendChild(element("div", "storm-report-lesson-title", lesson.headline));
    lessonBlock.appendChild(element("p", "storm-report-lesson-body", lesson.body));
    this.card.appendChild(lessonBlock);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "storm-report-dismiss";
    dismiss.textContent = "Keep building";
    dismiss.addEventListener("click", () => this.hide());
    this.card.appendChild(dismiss);

    this.backdrop.hidden = false;
    dismiss.focus();
  }

  hide(): void {
    this.backdrop.hidden = true;
  }

  dispose(): void {
    this.backdrop.remove();
  }
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
