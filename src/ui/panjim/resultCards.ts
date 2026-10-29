import type { StormPoints } from "@core/resiliencePoints";
import type { BoardRowView, RankView } from "@services/board";
import type { PhaseResult } from "@core/phaseResult";
import { resultHeadline } from "@core/phaseResult";
import { panajiRunPhrase } from "@ui/screens/runWords";
import { countWord } from "@ui/panjim/panjimHelp";
import { CLEAR_TOTAL_STARS } from "@core/panjimIndex";
import { DETAIL_BACK } from "@core/resultFlow";
import { ordinalWord } from "@core/lastCard";

/**
 * The end-of-phase result cards (Section 9): after each storm, a short
 * sequence in a modal. Each card's button names what comes next; Previous card
 * on every card after the first; Enter goes on; Esc does nothing (Section 34b.11: it jumped to the last card, and a
 * player lost a storm's payoff to one stray Esc).
 * Focus stays inside while it is open, and nothing else (Maya's bubble, the
 * map's labels) draws over it: it is above them and in their obstacle lists.
 * The only motion is a short fade between cards, none with reduced motion.
 */
export interface CardSpec {
  /** The card's content. */
  body: HTMLElement;
  /** What the main button says: what comes next. */
  button: string;
  /** A quieter link under the button (the final card's way back to the menu). */
  link?: string;
  /** Section 28.1: a second button beside the main one ("Try this storm again"); it closes the cards. */
  alt?: string;
  /** Section 35.2: a two column card (the finale and its rank box). */
  wide?: boolean;
  /** Section 35.5: one line in the buttons row ("Thank you."), read out when it appears. */
  note?: string;
  /** Section 35.5: what takes focus when the card opens (a selector in its body); the main button otherwise. */
  focus?: string;
  /**
   * Section 38.1: a second card behind a text link on this one (card 2, "What protected your homes", under the homes
   * saved bar). Its only button is "Back", to this card; the sequence does not move.
   */
  detail?: { link: string; body: HTMLElement };
  /**
   * Section 38.2: a card that wires its own buttons (the last card): no buttons row of its own, Enter outside a
   * button does nothing, and it closes only through `host()`'s handle.
   */
  bare?: boolean;
}

/** Section 38.2: a hosted card's handle. */
export interface HostedCard {
  /** Resolves when the card has been closed through `close`. */
  done: Promise<void>;
  /** Closes the card (the layer hides; the body is kept by its owner). */
  close: () => void;
}

/** What closed the cards: the last card's button, its link, or a card's second button (Section 28.1). */
export type CardsChoice = "button" | "link" | "alt";

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function el(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return div.firstElementChild as HTMLElement;
}

/** "★★☆", read out as "2 of 3 stars". */
function starsHtml(stars: number): string {
  const n = Math.max(0, Math.min(3, stars));
  return `<div class="result-stars" role="img" aria-label="${n} of 3 stars">${"★".repeat(n)}<span class="result-stars-empty">${"★".repeat(3 - n)}</span></div>`;
}

/**
 * "N of M homes saved" with a bar. Section 22.4 (owner decision): M is the homes still standing when the storm hit;
 * the ones an earlier storm ruined are their own small line, so a card never reads "0 of M" for earlier losses.
 */
export function homesHtml(saved: number, total: number, lostBefore = 0, paths: "its" | "the storms'" = "its"): string {
  const pct = total > 0 ? Math.round((saved / total) * 100) : 100;
  // Section 14: said in words when nothing in the path was lost.
  const all = total > 0 && saved >= total ? `<div class="result-homes-all">Every home in the path survived</div>` : "";
  const before = lostBefore > 0 ? `<div class="result-homes-before">Lost in earlier storms: ${lostBefore}</div>` : "";
  const text = total === 0 && lostBefore > 0 ? "No home in its path was still standing" : `<b>${saved}</b> of ${total} homes saved`;
  // Section 34: players read the total as the top bar's Homes at risk (the homes the storm would take); it is every
  // home standing in the storm's path, so it says so.
  // Section 34b.5: the final card counts every storm's path ("125 homes stood in the storms' paths; 20 were lost").
  const path = total > 0 && saved < total ? `<div class="result-homes-before result-homes-path">${total} homes stood in ${paths === "its" ? "its path" : "the storms' paths"}; ${total - saved} ${total - saved === 1 ? "was" : "were"} lost</div>` : "";
  return `<div class="result-homes">
    ${all}
    <div class="result-homes-text">${text}</div>
    <div class="result-bar" role="img" aria-label="${pct}% of homes saved"><span style="width:${pct}%"></span></div>
    ${path}
    ${before}
  </div>`;
}

/** Maya's one line on a card, in the card (her bubble never draws over the cards); a game rule is labelled as one. */
export type CardLine = { text: string; rule: boolean } | null;
function mayaHtml(line: CardLine): string {
  if (!line) return "";
  return `<p class="result-maya"><span class="result-maya-name">Maya</span>${line.rule ? `<span class="result-rule">Game rule</span>` : ""} ${esc(line.text)}</p>`;
}

/** At most this many places on card 1 (Section 16 B4); the rest are counted. */
export const MAX_PLACES = 4;

/** Card 1's places (Section 16 B4): the first four (damaged first, as `phaseResult` orders them) and a line for the rest. */
export function cardPlaces(places: PhaseResult["places"]): { shown: PhaseResult["places"]; more: string | null } {
  const rest = places.slice(MAX_PLACES);
  const restDamaged = rest.filter((p) => !p.stood).length;
  return { shown: places.slice(0, MAX_PLACES), more: rest.length === 0 ? null : `+${rest.length} more ${restDamaged === 0 ? "stood" : `(${restDamaged} damaged)`}` };
}

/** A place's chip: "Stood", "Damaged" for a building, "Flooded" for a place that is not one (Section 34b.5: a beach read "Damaged"). */
export function placeWord(place: { stood: boolean; building?: boolean }): string {
  return place.stood ? "Stood" : place.building === false ? "Flooded" : "Damaged";
}

/** Section 34b.5: a defence row of the other storm's kind gets the Tutorial's note ("A cyclone defence; this was a river flood"). */
export function otherKindNote(targets: readonly string[], storm: string): string | null {
  if (storm !== "cyclone" && storm !== "flood") return null;
  if (targets.includes(storm) || targets.length === 0) return null;
  return `A ${targets.includes("flood") ? "flood" : "cyclone"} defence; this was a ${storm === "flood" ? "river flood" : "cyclone"}`;
}

/** Section 34b.12 (owner decision 8): card 1's second button, saying where it goes. */
export function retryLabel(year: number): string {
  return `Try again from ${year}`;
}

/**
 * Section 35.2: card 1's points: "Points this storm" with its total, then one chip per source that earned any (Homes,
 * Places, Objective, Living coast). Separate chips, no dots between them.
 */
export function stormPointsHtml(points: StormPoints, chips = true): string {
  const sources: [string, number][] = [
    ["Homes", points.homes.points],
    ["Places", points.places.points],
    ["Objective", points.objective.points],
    ["Living coast", points.livingCoast.points]
  ];
  const shown = chips ? sources.filter(([, n]) => n > 0) : [];
  return `<div class="result-points" role="group" aria-label="Points this storm: ${points.total}">
    <div class="result-points-head"><span>Points this storm</span><b>${points.total}</b></div>
    ${shown.length ? `<ul class="result-points-chips">${shown.map(([label, n]) => `<li class="result-points-chip">${label} <b>+${n}</b></li>`).join("")}</ul>` : ""}
  </div>`;
}

/** Card 1: the storm's result. Section 35.2: with its points in Play Panjim. */
export function resultCard(result: PhaseResult, points?: StormPoints | null): HTMLElement {
  const { shown, more: moreText } = cardPlaces(result.places);
  const more = moreText ? `<li class="result-places-more">${esc(moreText)}</li>` : "";
  const places = result.places.length
    ? `<ul class="result-places">${shown
        .map((p) => `<li><span class="result-place-name">${esc(p.name)}</span><span class="result-chip ${p.stood ? "stood" : "damaged"}">${placeWord(p)}</span></li>`)
        .join("")}${more}</ul>`
    : "";
  return el(`<div class="result-card-body">
    <div class="result-eyebrow">${esc(result.eyebrow)}</div>
    <h2 class="result-title">${esc(resultHeadline(result.stars, result.homesStars))}</h2>
    ${starsHtml(result.stars)}
    ${objectiveHtml(result)}
    ${points ? stormPointsHtml(points) : ""}
    ${homesHtml(result.homesSaved, result.homesTotal, result.homesLostBefore)}
    ${windHtml(result.windLost)}
    ${result.nature ? natureHtml(result.nature) : ""}
    ${places}
    ${result.pushNote ? `<p class="result-short result-push">${esc(result.pushNote)}</p>` : ""}
  </div>`);
}

/**
 * The objective's badge (Section 12): "Objective done" (Section 37.7: everywhere, never "Objective complete"); with
 * fewer than three stars (Section 30.9) one line under it on what stopped the third star.
 */
export function objectiveHtml(result: PhaseResult): string {
  if (!result.objectiveComplete) return "";
  if (result.stars >= 3 || !result.shortOfThree) return `<div class="result-badge" role="note">Objective done</div>`;
  return `<div class="result-badge" role="note">Objective done</div><p class="result-short">${esc(result.shortOfThree)}</p>`;
}

/** Section 26.3: the homes the wind alone took, and what shields them (a game rule). Nothing when it took none. */
export function windHtml(windLost: number): string {
  if (windLost <= 0) return "";
  return `<div class="result-wind" role="note">The wind alone took ${windLost === 1 ? "one of the homes lost" : `${windLost} of the homes lost`}. <span class="result-wind-why">In this game pandanus shields the homes within 2 tiles of it.</span></div>`;
}

/** Section 25.2: the card's second line: the biodiversity change since the run began, and a few words on why. */
export function natureHtml(nature: { change: number; target: number; reason: string; since: number; at?: string }): string {
  const sign = nature.change > 0 ? "+" : nature.change < 0 ? "\u2212" : "";
  const tone = nature.change < 0 ? "down" : nature.change >= nature.target ? "up" : "level";
  return `<div class="result-nature ${tone}" role="note"><span><b>${sign}${Math.abs(Math.round(nature.change))}</b> biodiversity ${nature.at ? `${esc(nature.at)}, against ${nature.since}` : `since ${nature.since}`}</span><span class="result-nature-why">${esc(nature.reason)}</span></div>`;
}

/** A defence row's number; Section 30.11 bug 13: one that shared the work reads so, never 0. */
function rowValue(d: { homes: number; shared?: boolean }): string {
  return d.homes === 0 && d.shared ? `<span class="result-row-value shared">Shared the work</span>` : `<span class="result-row-value">${d.homes}</span>`;
}

/**
 * Card 2: what protected the homes, one row per kind of defence built in the phase. Section 34b.5: a row of the other
 * storm's kind says so (`targets`: what each defence answers, `storm`: "cyclone", "flood" or "compound"), and each
 * defence that broke in this storm has a row of its own after them.
 */
export function defencesCard(result: PhaseResult, mayaLine: CardLine, targets: (elementId: string) => readonly string[] = () => [], storm = ""): HTMLElement {
  const most = Math.max(1, ...result.defences.map((d) => d.homes));
  const stormWord = storm === "cyclone" ? "cyclone" : storm === "flood" ? "flood" : "storm";
  const broken = (result.broken ?? [])
    .map(
      (b) =>
        `<li class="result-row-broken" data-defence="${esc(b.elementId)}"><span class="result-row-name">${esc(b.name)}</span><span class="result-row-value broken">Broke in this ${stormWord}</span>${b.cracked ? `<span class="result-row-why">Cracked with age</span>` : ""}</li>`
    )
    .join("");
  const rows = result.defences.length || broken
    ? `<p class="result-sub">Homes that would have been lost without each defence. Defences cover for each other, so the rows need not add up to the homes saved.</p>
       <ul class="result-rows">${result.defences
         .map((d) => {
           const why = otherKindNote(targets(d.elementId), storm);
           return `<li data-defence="${esc(d.elementId)}"><span class="result-row-name">${esc(d.name)}</span><span class="result-row-bar" aria-hidden="true"><span style="width:${Math.round((d.homes / most) * 100)}%"></span></span>${rowValue(d)}${why ? `<span class="result-row-why">${esc(why)}</span>` : ""}</li>`;
         })
         .join("")}${broken}</ul>`
    : `<p class="result-sub">Nothing stood in the way this time.</p>`;
  // Section 34b.13: after the 2050 storm, when most of the homes lost stood in the wind at Campal.
  const wind = result.windNote ? `<p class="result-short result-wind-note">${esc(result.windNote)}</p>` : "";
  return el(`<div class="result-card-body">
    <div class="result-eyebrow">${esc(result.eyebrow)}</div>
    <h2 class="result-title">What protected your homes</h2>
    ${rows}
    ${wind}
    ${result.defences.length ? mayaHtml(mayaLine) : ""}
  </div>`);
}

/** Card 3: the next storm, with its forecast's map and legend, under one heading ("Monsoon flood · 2040 · in 10 years"). */
export function comingUpCard(title: string, preview: HTMLElement | null, mayaLine: CardLine): HTMLElement {
  // One heading (Section 16 B4): the preview's own line is not shown on this card.
  preview?.querySelector(".cone-preview-line")?.remove();
  const body = el(`<div class="result-card-body">
    <div class="result-eyebrow">Coming up</div>
    <h2 class="result-title">${esc(title)}</h2>
    <div class="result-preview"></div>
    ${mayaHtml(mayaLine)}
  </div>`);
  if (preview) body.querySelector(".result-preview")!.appendChild(preview);
  return body;
}

/**
 * Section 31.4: a Tutorial storm's defence row: every defence built so far, the homes it saved in this storm, and
 * where it saved none, one line why ("A cyclone defence; this was a flood").
 */
export interface TutorialDefenceRow {
  elementId: string;
  name: string;
  homes: number;
  why: string | null;
}

/** The Tutorial's card for one storm: the stars, the homes saved and every defence built, with why where it saved none. */
export function tutorialResultCard(result: PhaseResult, rows: readonly TutorialDefenceRow[], last: boolean): HTMLElement {
  const most = Math.max(1, ...rows.map((d) => d.homes));
  const list = rows.length
    ? `<h3 class="result-subtitle">What protected your homes</h3>
       <p class="result-sub">Each number is the homes it took out of this storm's way when you built it.</p>
       <ul class="result-rows tutorial-rows">${rows
         .map(
           (d) =>
             `<li data-defence="${esc(d.elementId)}"><span class="result-row-name">${esc(d.name)}</span><span class="result-row-bar" aria-hidden="true"><span style="width:${Math.round((d.homes / most) * 100)}%"></span></span><span class="result-row-value">${d.homes}</span>${d.why ? `<span class="result-row-why">${esc(d.why)}</span>` : ""}</li>`
         )
         .join("")}</ul>`
    : `<p class="result-sub">Nothing stood in the storm's way this time.</p>`;
  return el(`<div class="result-card-body tutorial-result">
    <div class="result-eyebrow">Tutorial, ${esc(result.eyebrow)}</div>
    <h2 class="result-title">${esc(resultHeadline(result.stars))}</h2>
    ${starsHtml(result.stars)}
    ${homesHtml(result.homesSaved, result.homesTotal, result.homesLostBefore)}
    ${list}
    ${last ? "" : `<p class="result-sub">Next, a river flood. Its defences go on the estuary and the river.</p>`}
  </div>`);
}

/**
 * Section 31.4: the Tutorial's last card: how many of the seven defences the player tried, each with its icon and one
 * line on what it is best at (game rules), then on to Panjim, the real city.
 */
export function tutorialFinalCard(tried: ReadonlySet<string>, steps: readonly { id: string; name: string; icon: string; bestAt: string }[]): HTMLElement {
  const n = steps.filter((s) => tried.has(s.id)).length;
  return el(`<div class="result-card-body tutorial-final">
    <div class="result-eyebrow">Tutorial</div>
    <h2 class="result-title">You tried ${n} of ${steps.length} defences</h2>
    <div class="result-sub">In this game:</div>
    <ul class="tutorial-final-list">${steps
      .map(
        (s) =>
          `<li class="${tried.has(s.id) ? "tried" : "untried"}" data-defence="${esc(s.id)}"><span class="tutorial-final-icon" aria-hidden="true">${s.icon}</span><span class="tutorial-final-text"><b>${esc(s.name)}</b><span>${esc(s.bestAt)}</span></span></li>`
      )
      .join("")}</ul>
    <p class="result-sub">Panjim is the real city: ${esc(panajiRunPhrase())}.</p>
  </div>`);
}

/**
 * The final card: the three phases, the total, the stars won of the stars there were, and whether Panjim is
 * cleared (Section 22.4, a game rule: at least one star in every storm and `CLEAR_TOTAL_STARS` in all).
 */
export function finalCard(
  phases: { label: string; saved: number; total: number }[],
  result: { totalStars: number; cleared: boolean },
  /** Section 25.2: the biodiversity line as the last storm came, and the star lines it is judged by. */
  nature?: { line: { change: number; target: number; reason: string; since: number; at?: string }; rule: string }
): HTMLElement {
  const saved = phases.reduce((s, p) => s + p.saved, 0);
  const total = phases.reduce((s, p) => s + p.total, 0);
  const most = phases.length * 3;
  return el(`<div class="result-card-body">
    <h2 class="result-title">Panjim, 2026 to 2050</h2>
    <ul class="result-phases">${phases.map((p) => `<li><span>${esc(p.label)}</span><span><b>${p.saved}</b> of ${p.total} homes saved</span></li>`).join("")}</ul>
    ${homesHtml(saved, total, 0, "the storms'")}
    ${nature ? natureHtml(nature.line) : ""}
    <div class="result-stars-total" role="img" aria-label="${result.totalStars} of ${most} stars"><b>${result.totalStars}</b> of ${most} stars</div>
    <div class="result-clear ${result.cleared ? "cleared" : "not-cleared"}">${result.cleared ? "Panjim cleared" : "Not cleared yet"}</div>
    <p class="result-clear-rule"><span class="result-rule">Game rule</span> In this game you clear Panjim with at least one star in every storm and ${countWord(CLEAR_TOTAL_STARS)} of the ${countWord(most)} stars in all.${nature ? ` ${esc(nature.rule)}` : ""}</p>
  </div>`);
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st" (core/lastCard.ts). */
export const ordinal = ordinalWord;

/** The rank box's state: waiting for the board, the board unreachable, or the run's place. */
export type RankState =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "ready"; rank: RankView }
  /** A named run the board could not take (over the limit, refused, unreachable mid post): where it would be. */
  | { status: "unposted"; rank: RankView }
  /** The board already holds this run (a post that timed out here but landed there). */
  | { status: "on-board" };

/** The rank box on the last card (Section 38.2; the finale's before): the place on the board, the gap to the row above, and the rows round the run. */
export function rankHtml(state: RankState, name: string | null): string {
  if (state.status === "loading") return `<div class="finale-rank-head">The board</div><p class="finale-rank-note">Checking the board.</p>`;
  if (state.status === "offline") return `<div class="finale-rank-head">Board offline</div><p class="finale-rank-note">The board can't be reached right now. Your points are above.</p>`;
  if (state.status === "on-board") return `<div class="finale-rank-head">On the board</div><p class="finale-rank-note">This run is on the board.</p>`;
  if (state.status === "unposted") {
    return `<div class="finale-rank-head">Not on the board yet</div><p class="finale-rank-note">The board could not take this run just now. With these points it would be ${ordinal(state.rank.rank)}.</p>`;
  }
  const { rank, points, tenth, above, below } = state.rank;
  if (!name) {
    return `<div class="finale-rank-head">The board</div><p class="finale-rank-note">With a name, this run would be ${ordinal(rank)} on the board. Add one on the right.</p>`;
  }
  const head = rank <= 10 || tenth === null ? `${ordinal(rank)} on the board` : `${tenth - points} points short of the top 10`;
  const nearest = above[above.length - 1];
  // Section 37.3: one row a name; a run that did not beat its name's best leaves that row on the board.
  const gap = state.rank.kept
    ? `Your best run under this name stays on the board, with ${points} points.`
    : nearest
      ? `${nearest.points - points} points behind ${ordinal(nearest.rank)}`
      : "Top of the board";
  const row = (r: BoardRowView, me = false): string =>
    `<li class="${me ? "me" : ""}"${me ? ' aria-current="true"' : ""}><span class="finale-rank-place">${r.rank}</span><span class="finale-rank-name">${esc(r.name)}</span><b>${r.points}</b></li>`;
  const mine: BoardRowView = { rank, name, points, season: "" };
  return `<div class="finale-rank-head">${esc(head)}</div>
    <p class="finale-rank-note">${esc(gap)}</p>
    <ol class="finale-rank-rows">${above.map((r) => row(r)).join("")}${row(mine, true)}${below.map((r) => row(r)).join("")}</ol>`;
}


export class ResultCards {
  readonly el: HTMLElement;
  private readonly cardEl: HTMLElement;
  private open = false;
  /** Section 34: the open card set's listeners, so a session disposed with cards up (the idle reset) takes them away. */
  private abort: AbortController | null = null;

  constructor(private readonly container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "result-cards";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="result-card" role="dialog" aria-modal="true"></div>`;
    this.cardEl = this.el.querySelector(".result-card")!;
    container.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Section 38.2: closes the card `host()` put up; nothing when none is. */
  private closeHosted: (() => void) | null = null;

  /**
   * Section 38.2: shows one card that wires its own buttons (the last card) and keeps it up until `close` is called.
   * Its body is the caller's and is left intact on close, so it can be shown again with its state (View map, then
   * Back to your result). Its "What protected your homes" link, when `detail` is given, opens card 2 with Back.
   */
  host(spec: Omit<CardSpec, "button" | "bare">): HostedCard {
    const done = this.show([{ ...spec, button: "", bare: true }]).then(() => undefined);
    return { done, close: () => this.closeHosted?.() };
  }

  /** Shows `cards` in order; resolves when the last card's button (or link) is pressed. */
  show(cards: CardSpec[]): Promise<CardsChoice> {
    if (cards.length === 0) return Promise.resolve("button");
    const before = document.activeElement as HTMLElement | null;
    this.open = true;
    this.el.hidden = false;
    this.container.classList.add("has-result-cards");
    return new Promise((resolve) => {
      let index = 0;
      const abort = new AbortController();
      this.abort = abort;
      const close = (choice: CardsChoice): void => {
        abort.abort();
        this.closeHosted = null;
        this.open = false;
        this.el.hidden = true;
        this.cardEl.replaceChildren();
        this.container.classList.remove("has-result-cards");
        before?.focus?.();
        resolve(choice);
      };
      this.closeHosted = () => close("button");
      let detailOpen = false;
      /** Section 38.1: card 2 behind its link: the same slot, "Back" its only button, Enter is Back too. */
      const renderDetail = (spec: CardSpec): void => {
        const detail = spec.detail!;
        detailOpen = true;
        this.cardEl.replaceChildren(detail.body);
        this.cardEl.classList.toggle("wide", false);
        this.cardEl.setAttribute("aria-label", detail.body.querySelector(".result-title")?.textContent ?? "Result");
        const actions = document.createElement("div");
        actions.className = "result-actions";
        const back = document.createElement("button");
        back.type = "button";
        back.className = "result-back result-detail-back";
        back.textContent = DETAIL_BACK;
        back.addEventListener("click", () => render());
        actions.appendChild(back);
        this.cardEl.appendChild(actions);
        this.cardEl.classList.remove("entering");
        void this.cardEl.offsetWidth;
        this.cardEl.classList.add("entering");
        back.focus();
      };
      const render = (): void => {
        const spec = cards[index];
        detailOpen = false;
        this.cardEl.replaceChildren(spec.body);
        this.cardEl.classList.toggle("wide", spec.wide === true);
        const label = spec.body.querySelector(".result-title")?.textContent ?? "Result";
        this.cardEl.setAttribute("aria-label", label);
        if (spec.detail) {
          // The link is made under the homes saved bar, unless the body carries its own (the last card's, inline).
          let link = spec.body.querySelector<HTMLButtonElement>(".result-detail-link");
          if (!link) {
            link = document.createElement("button");
            link.type = "button";
            link.className = "result-detail-link";
            link.textContent = spec.detail.link;
            const homes = spec.body.querySelector(".result-homes");
            if (homes) homes.after(link);
            else spec.body.appendChild(link);
          }
          if (!link.dataset.wired) {
            link.dataset.wired = "1";
            link.addEventListener("click", () => renderDetail(spec));
          }
        }
        if (spec.bare) {
          this.cardEl.classList.remove("entering");
          void this.cardEl.offsetWidth;
          this.cardEl.classList.add("entering");
          const first = spec.focus ? spec.body.querySelector<HTMLElement>(spec.focus) : null;
          (first ?? spec.body.querySelector<HTMLElement>("button, input"))?.focus();
          return;
        }
        const actions = document.createElement("div");
        actions.className = "result-actions";
        if (index > 0) {
          const back = document.createElement("button");
          back.type = "button";
          back.className = "result-back";
          // Section 34b.5: "Back" sat beside "Back to the menu" and read as one.
          back.textContent = "Previous card";
          back.addEventListener("click", () => {
            index--;
            render();
          });
          actions.appendChild(back);
        }
        if (spec.alt) {
          const alt = document.createElement("button");
          alt.type = "button";
          alt.className = "result-retry";
          alt.textContent = spec.alt;
          alt.addEventListener("click", () => close("alt"));
          actions.appendChild(alt);
        }
        const go = document.createElement("button");
        go.type = "button";
        go.className = "result-next";
        go.textContent = spec.button;
        go.addEventListener("click", () => advance());
        actions.appendChild(go);
        if (spec.note) {
          const note = document.createElement("p");
          note.className = "result-note";
          note.setAttribute("role", "status");
          note.textContent = spec.note;
          actions.prepend(note);
        }
        this.cardEl.appendChild(actions);
        if (spec.link) {
          const link = document.createElement("button");
          link.type = "button";
          link.className = "result-link";
          link.textContent = spec.link;
          link.addEventListener("click", () => close("link"));
          this.cardEl.appendChild(link);
        }
        this.cardEl.classList.remove("entering");
        void this.cardEl.offsetWidth;
        this.cardEl.classList.add("entering");
        const first = spec.focus ? spec.body.querySelector<HTMLElement>(spec.focus) : null;
        if (first) first.focus();
        else go.focus();
      };
      const advance = (): void => {
        if (detailOpen) {
          render();
          return;
        }
        // A hosted card closes only through its handle.
        if (cards[index].bare) return;
        if (index < cards.length - 1) {
          index++;
          render();
        } else close("button");
      };
      // On window, in the capture phase: before any other handler (Maya's Esc, the level's Esc, the shortcuts).
      window.addEventListener(
        "keydown",
        (event) => {
          if (!this.open) return;
          // A held key does not rush through the cards.
          if (event.repeat && (event.key === "Enter" || event.key === "Escape")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (event.key === "Escape") {
            // Section 34b.11 (owner decision 3): Esc does nothing on the cards (it jumped to the last card); Previous
            // card and the buttons stay. It still stops here, so nothing under the cards takes it.
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (event.key === "Enter") {
            // A focused button presses itself; anywhere else Enter goes on.
            const target = event.target as HTMLElement | null;
            event.stopImmediatePropagation();
            if (target && target.closest("button") && this.el.contains(target)) return;
            // Section 35.5: in a form's field Enter types (a new line in a text box) or does nothing; it never submits.
            if (target && target.closest("input, textarea, select") && this.el.contains(target)) {
              if (target.tagName !== "TEXTAREA") event.preventDefault();
              return;
            }
            event.preventDefault();
            advance();
            return;
          }
          if (event.key === "Tab") {
            // Focus stays in the card (in the nudge's box while it is up, Section 38.3).
            const scope = this.el.querySelector<HTMLElement>(".result-nudge") ?? this.cardEl;
            const focusable = [...scope.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")];
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (event.shiftKey && (active === first || !this.el.contains(active))) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && (active === last || !this.el.contains(active))) {
              event.preventDefault();
              first.focus();
            }
            return;
          }
          // Shortcuts (R, M, S) and the rest wait while the cards are up.
          event.stopImmediatePropagation();
        },
        { signal: abort.signal, capture: true }
      );
      render();
    });
  }

  /**
   * Section 38.3: a small box over the dimmed card, once: the title, the line, "Answer now" and "{Action} anyway".
   * Resolves with which was pressed; Esc does nothing; Tab stays in the box. The card under it is kept as it is.
   */
  nudge(text: { title: string; line: string; answer: string; anyway: string }): Promise<"answer" | "anyway"> {
    return new Promise((resolve) => {
      const box = document.createElement("div");
      box.className = "result-nudge";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-labelledby", "result-nudge-title");
      box.innerHTML = `<div class="result-nudge-card">
        <h3 class="result-nudge-title" id="result-nudge-title">${esc(text.title)}</h3>
        <p class="result-nudge-line">${esc(text.line)}</p>
        <div class="result-nudge-actions">
          <button type="button" class="result-nudge-answer btn-primary">${esc(text.answer)}</button>
          <button type="button" class="result-nudge-anyway btn">${esc(text.anyway)}</button>
        </div>
      </div>`;
      const before = document.activeElement as HTMLElement | null;
      const done = (choice: "answer" | "anyway"): void => {
        box.remove();
        this.cardEl.classList.remove("dimmed");
        if (choice === "anyway") before?.focus?.();
        resolve(choice);
      };
      box.querySelector(".result-nudge-answer")!.addEventListener("click", () => done("answer"));
      box.querySelector(".result-nudge-anyway")!.addEventListener("click", () => done("anyway"));
      this.cardEl.classList.add("dimmed");
      this.el.appendChild(box);
      box.querySelector<HTMLElement>(".result-nudge-answer")!.focus();
    });
  }

  dispose(): void {
    // Its window keydown listener (capture phase) swallowed every key on the menu after an idle reset over the cards,
    // and kept the old session alive.
    this.abort?.abort();
    this.abort = null;
    this.open = false;
    this.el.remove();
  }
}
