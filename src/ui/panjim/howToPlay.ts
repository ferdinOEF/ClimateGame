import type { LevelDef } from "@levels/levels";
import type { ChallengeKind } from "@core/climate";
import { POINT_VALUES } from "@core/resiliencePoints";
import { CARD_ICON, CARD_LINES, CARD_NAME, cardBiodiversity, DEFENCE_ORDER } from "./defenceCards";

/**
 * Section 39.3 (owner decision): How to play, in place of Play Panjim's start popup. The flow is main screen, Play
 * Panjim, the name card, How to play, "Let's Play!", the game. It shows in the start popup's backdrop
 * (ObjectivesPanel), and "Let's Play!" is the popup's old Begin (class `brief-cta`, the same handler), so everything
 * after it is unchanged. Every number on it comes from the level, the element data and the points config.
 *
 * Section 40.3 (owner decision): one card as before (the same size and scale rule), showing one of three screens at a
 * time: "Three disasters are coming", "Each year" and "Know these icons". Next and Back move between them; "Let's
 * Play!" is on the third. "Read the map" is gone. The colours are the five colours (theme.css's block on the card).
 */

export interface HowToPlayStorm {
  year: number;
  kind: ChallengeKind;
  /** "Cyclone", "Flood" or "Both". */
  label: string;
  /** "Miramar beach", from the level's storm. */
  where: string;
  /** Builds from the one before (the start, or the storm before) to this storm: "5 turns". */
  turns: number;
}

/** One defense on screen 2, from the build cards' own data. */
export interface HowToPlayDefence {
  id: string;
  name: string;
  /** The first line of its build card. */
  line: string;
  /** Its change to biodiversity (the leaf chip). */
  bio: number;
}

export interface HowToPlayModel {
  startYear: number;
  endYear: number;
  /** One build a year: 25 builds in 25 years. */
  builds: number;
  storms: HowToPlayStorm[];
  duneBio: number;
  mangroveBio: number;
  seawallBio: number;
  /** The seven defenses, in the build menu's order. */
  defences: HowToPlayDefence[];
  /** Points a home saved (the points config). */
  homePoints: number;
  /** Points for each biodiversity point added (the points config). */
  bioPoints: number;
}

const KIND_LABEL: Record<ChallengeKind, string> = { cyclone: "Cyclone", flood: "Flood", compound: "Both" };

/** The screen's numbers and words, from the level (pure: no DOM, so the tests can read it in Node). */
export function howToPlayModel(level: LevelDef): HowToPlayModel {
  const startYear = level.timeline?.startYear ?? 0;
  const endYear = level.timeline?.endYear ?? startYear;
  let before = 0;
  const storms = [...(level.climate?.challenges ?? [])]
    .sort((a, b) => a.year - b.year)
    .map((c) => {
      // A storm comes at the end of its year: the 2030 storm after the 2026 to 2030 builds (turn 5).
      const turn = c.year - startYear + 1;
      const storm = { year: c.year, kind: c.kind, label: KIND_LABEL[c.kind], where: c.where ?? "", turns: turn - before };
      before = turn;
      return storm;
    });
  return {
    startYear,
    endYear,
    builds: endYear - startYear + 1,
    storms,
    duneBio: cardBiodiversity("dune"),
    mangroveBio: cardBiodiversity("mangrove"),
    seawallBio: cardBiodiversity("seawall"),
    defences: DEFENCE_ORDER.map((id) => ({ id, name: CARD_NAME[id], line: CARD_LINES[id][0], bio: cardBiodiversity(id) })),
    homePoints: POINT_VALUES.home,
    bioPoints: POINT_VALUES.biodiversity
  };
}

/** Section 40.3: the card's screens. */
export const HOWTO_SCREENS = 3;
export const HOWTO_HEADINGS = ["Three disasters are coming", "Each year", "Know these icons"] as const;
export const HOWTO_NEXT = "Next";
export const HOWTO_BACK = "Back";
export const HOWTO_PLAY = "Let's Play!";

/** The screen Next or Back goes to from `screen` (1 to 3; it stops at the ends). */
export function howToStep(screen: number, move: "next" | "back"): number {
  return Math.max(1, Math.min(HOWTO_SCREENS, Math.round(screen) + (move === "next" ? 1 : -1)));
}

/** A screen's foot row: Back on every screen but the first; Next, and "Let's Play!" on the last. */
export function howToFoot(screen: number): { back: boolean; main: typeof HOWTO_NEXT | typeof HOWTO_PLAY } {
  return { back: screen > 1, main: screen >= HOWTO_SCREENS ? HOWTO_PLAY : HOWTO_NEXT };
}

/** Each storm card's title and line (the model's label, but "Both together!" for the two at once). */
const STORM_TEXT: Record<ChallengeKind, { title: (label: string) => string; line: string }> = {
  cyclone: { title: (label) => label, line: "Waves and surge from the sea, with wind" },
  flood: { title: (label) => label, line: "Monsoon water down the Mandovi" },
  compound: { title: () => "Both together!", line: "A cyclone and a flood at the same time" }
};

const svg = (body: string, size = 34): string => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;

/** The cyclone: a ring with two curved arms. */
const CYCLONE = '<circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 8.6 C12 4.6 15 3 18.5 3.6 M12 15.4 C12 19.4 9 21 5.5 20.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
/** The river flood: three wavy lines. */
const FLOOD = '<path d="M3.5 7.5 q2.1-2 4.2 0 t4.2 0 t4.2 0 t4.2 0 M3.5 12.5 q2.1-2 4.2 0 t4.2 0 t4.2 0 t4.2 0 M3.5 17.5 q2.1-2 4.2 0 t4.2 0 t4.2 0 t4.2 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
/** The wind: three lines, two of them curling. */
const WIND = '<path d="M3 9 H14 a3 3 0 1 0 -3 -3 M3 13.5 H18 a3 3 0 1 1 -3 3 M3 18 H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const LEAF = '<path d="M5 19 C5 9 11 4.5 19.5 4.5 C19.5 13 15 19 5 19 Z M5 19 L13 11" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>';
/** A home: a roof, its walls and a door. */
const HOUSE = '<path d="M3.5 11.5 L12 4 L20.5 11.5 M6 10 V19.5 H18 V10 M10.2 19.5 V14 H13.8 V19.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
/** Both: the cyclone over the waves, smaller. */
const BOTH = '<g transform="translate(-2.5 -3) scale(0.78)">' + CYCLONE + '</g><path d="M10 15.5 q1.8-1.7 3.6 0 t3.6 0 t3.6 0 M10 19.5 q1.8-1.7 3.6 0 t3.6 0 t3.6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
const KIND_ICON: Record<ChallengeKind, string> = { cyclone: CYCLONE, flood: FLOOD, compound: BOTH };

/** "Click a Tile": a glowing hexagon with the pointer on it. */
const TILE_PICTURE =
  '<svg class="howto-tile-art" viewBox="0 0 80 80" width="74" height="74" aria-hidden="true" focusable="false">' +
  '<polygon class="howto-hex-glow" points="40,4 71,22 71,58 40,76 9,58 9,22"/>' +
  '<polygon class="howto-hex" points="40,9 66,24.5 66,55.5 40,71 14,55.5 14,24.5"/>' +
  '<path class="howto-pointer" d="M44 40 L44 64 L50 58 L55 69 L59.5 67 L54.5 56.5 L63 56.5 Z"/>' +
  "</svg>";

const CHEVRON = '<svg class="howto-chevron" viewBox="0 0 12 20" width="14" height="24" aria-hidden="true" focusable="false"><path d="M2 2 L10 10 L2 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The arrow from one storm card to the next, under its "{n} turns". */
const ARROW = '<svg class="howto-arrow" viewBox="0 0 84 16" width="84" height="16" aria-hidden="true" focusable="false"><path d="M2 8 H78 M70 2 L80 8 L70 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** The leaf chip, as the build cards word it ("Biodiversity plus 3"): teal for plus, pink for minus. */
function bioChip(change: number): string {
  const tone = change > 0 ? "up" : change < 0 ? "down" : "level";
  const said = `Biodiversity ${change > 0 ? "plus " : change < 0 ? "minus " : ""}${Math.abs(change)}`;
  return `<span class="howto-chip ${tone}" role="img" aria-label="${said}">${svg(LEAF, 11)}<span>${signed(change)}</span></span>`;
}

const RULES_CHIP = '<span class="howto-rules">Game rules</span>';

/** Screen 1: the three storms, from the start year to each, with the turns between them. */
function screenOne(m: HowToPlayModel): string {
  const storms = m.storms
    .map((s, i) => {
      const text = STORM_TEXT[s.kind];
      const title = text.title(s.label);
      const turns = `${s.turns} ${s.turns === 1 ? "turn" : "turns"}`;
      return `<div class="howto-gap"><span>${turns}</span>${ARROW}</div>
        <div class="howto-storm howto-storm-${s.kind}" role="group" aria-label="${esc(`Storm ${i + 1}, ${s.year}: ${title}, ${s.where}, after ${turns}`)}">
          <div class="howto-storm-top"><b class="howto-storm-year">${s.year}</b><span class="howto-storm-n">Storm ${i + 1}</span></div>
          <div class="howto-storm-body">
            <span class="howto-storm-icon">${svg(KIND_ICON[s.kind], 54)}</span>
            <b class="howto-storm-title">${esc(title)}</b>
            <span class="howto-storm-line">${esc(text.line)}</span>
            <span class="howto-storm-where">${esc(s.where)}</span>
          </div>
        </div>`;
    })
    .join("");
  return `<section class="howto-screen howto-screen-1" data-screen="1" aria-labelledby="howto-heading-1">
      <div class="howto-head"><h2 class="howto-title" id="howto-heading-1">${HOWTO_HEADINGS[0]}</h2>${RULES_CHIP}</div>
      <p class="howto-lead">It's ${m.startYear}. A cyclone, a flood, then both together! Keep Panjim standing till ${m.endYear}.</p>
      <div class="howto-road">
        <div class="howto-road-start"><span class="howto-start-dot" aria-hidden="true"></span><b>${m.startYear}</b><span>You start</span></div>
        ${storms}
      </div>
    </section>`;
}

/** Screen 2: a year's three steps, and the seven defenses with their leaf chips. */
function screenTwo(m: HowToPlayModel): string {
  const builds = m.defences
    .map(
      (d) => `<li class="howto-build" data-defence="${esc(d.id)}">
          <span class="howto-build-icon" aria-hidden="true">${CARD_ICON[d.id] ?? ""}</span>
          <div class="howto-build-text"><div class="howto-build-head"><b>${esc(d.name)}</b>${bioChip(d.bio)}</div><span>${esc(d.line)}</span></div>
        </li>`
    )
    .join("");
  return `<section class="howto-screen howto-screen-2" data-screen="2" aria-labelledby="howto-heading-2" hidden>
      <div class="howto-head"><h2 class="howto-title" id="howto-heading-2">${HOWTO_HEADINGS[1]}</h2>${RULES_CHIP}<span class="howto-head-note">${m.builds} turns or builds in ${m.builds} years</span></div>
      <div class="howto-box howto-steps">
        <figure class="howto-step"><div class="howto-step-art">${TILE_PICTURE}</div><figcaption>Click a Tile</figcaption></figure>
        ${CHEVRON}
        <figure class="howto-step"><div class="howto-step-art"><div class="howto-mini-card"><span class="howto-mini-icon">${CARD_ICON.dune}</span><span class="howto-mini-name">${esc(CARD_NAME.dune)}</span>${bioChip(m.duneBio)}</div></div><figcaption>Build a Defense</figcaption></figure>
        ${CHEVRON}
        <figure class="howto-step"><div class="howto-step-art howto-years"><span class="howto-year-from">${m.startYear}</span> → <span class="howto-year-to">${m.startYear + 1}</span></div><figcaption>1 turn = 1 build = 1 year</figcaption></figure>
      </div>
      <div class="howto-subhead"><h3>What you can build</h3><span class="howto-legend">${bioChip(m.mangroveBio)}<span>adds to biodiversity</span>${bioChip(m.seawallBio)}<span>takes from it</span></span></div>
      <ul class="howto-builds">
        ${builds}
        <li class="howto-build howto-build-note">Each one fits only some tiles. Click a tile to see what it takes.</li>
      </ul>
    </section>`;
}

/** Screen 3: the three icons, and the two ways to get points (the numbers from the points config). */
function screenThree(m: HowToPlayModel): string {
  return `<section class="howto-screen howto-screen-3" data-screen="3" aria-labelledby="howto-heading-3" hidden>
      <div class="howto-head"><h2 class="howto-title" id="howto-heading-3">${HOWTO_HEADINGS[2]}</h2>${RULES_CHIP}</div>
      <div class="howto-tiles">
        <div class="howto-tile howto-tile-cyclone" role="group" aria-label="Cyclone: waves and surge from the sea"><span class="howto-icon howto-icon-cyclone">${svg(CYCLONE, 54)}</span><b>Cyclone</b><span>Waves and surge from the sea</span></div>
        <div class="howto-tile howto-tile-flood" role="group" aria-label="River flood: monsoon water down the Mandovi"><span class="howto-icon howto-icon-flood">${svg(FLOOD, 54)}</span><b>River flood</b><span>Monsoon water down the Mandovi</span></div>
        <div class="howto-tile howto-tile-wind" role="group" aria-label="Wind: comes with every cyclone"><span class="howto-icon howto-icon-wind">${svg(WIND, 54)}</span><b>Wind</b><span>Comes with every cyclone</span></div>
      </div>
      <div class="howto-subhead"><h3>Get points</h3></div>
      <div class="howto-points">
        <div class="howto-point howto-point-homes" role="group" aria-label="Save homes">
          <span class="howto-point-icon">${svg(HOUSE, 46)}</span>
          <div class="howto-point-text"><b>Save homes</b><p>Every home still standing after a storm scores.</p><span class="howto-point-chip">${m.homePoints} points a home</span></div>
        </div>
        <div class="howto-point howto-point-nature" role="group" aria-label="Increase biodiversity">
          <span class="howto-point-icon">${svg(LEAF, 46)}</span>
          <div class="howto-point-text"><b>Increase biodiversity</b><p>Nature based defenses like mangroves and khazans add Biodiversity Points. Dams and seawalls (concrete and metal) reduce them.</p><span class="howto-point-chip">${m.bioPoints} points for each Biodiversity Point you add</span></div>
        </div>
      </div>
    </section>`;
}

/** The card's inside: the band, the three screens (the first showing) and the foot row. Pure, so the tests read it in Node. */
export function howToPlayHtml(m: HowToPlayModel): string {
  const marks = Array.from({ length: HOWTO_SCREENS }, (_, i) => `<i${i === 0 ? ' class="on"' : ""}></i>`).join("");
  return `
    <div class="howto-band"><span>How to play</span><span class="howto-progress"><span class="howto-count">1 of ${HOWTO_SCREENS}</span><span class="howto-said" aria-live="polite"></span><span class="howto-marks" aria-hidden="true">${marks}</span></span></div>
    ${screenOne(m)}
    ${screenTwo(m)}
    ${screenThree(m)}
    <div class="howto-foot">
      <button type="button" class="howto-back" hidden>${HOWTO_BACK}</button>
      <button type="button" class="howto-next btn-primary">${HOWTO_NEXT}</button>
      <button type="button" class="brief-cta howto-cta" hidden>${HOWTO_PLAY}</button>
    </div>`;
}

/** Shows screen `screen` (1 to 3) of `card`: its marks, its foot row, and focus on its main button. */
export function showHowToScreen(card: HTMLElement, screen: number, focus = true): void {
  const n = Math.max(1, Math.min(HOWTO_SCREENS, Math.round(screen)));
  card.dataset.screen = String(n);
  for (const el of card.querySelectorAll<HTMLElement>(".howto-screen")) el.hidden = el.dataset.screen !== String(n);
  card.querySelector(".howto-count")!.textContent = `${n} of ${HOWTO_SCREENS}`;
  // Read out (the focus stays on the same Next button from screen 1 to 2, so nothing else would say the screen changed).
  card.querySelector(".howto-said")!.textContent = `${n} of ${HOWTO_SCREENS}, ${HOWTO_HEADINGS[n - 1]}`;
  card.querySelectorAll(".howto-marks i").forEach((mark, i) => mark.classList.toggle("on", i === n - 1));
  const foot = howToFoot(n);
  const next = card.querySelector<HTMLButtonElement>(".howto-next")!;
  const play = card.querySelector<HTMLButtonElement>(".howto-cta")!;
  card.querySelector<HTMLButtonElement>(".howto-back")!.hidden = !foot.back;
  next.hidden = foot.main !== HOWTO_NEXT;
  play.hidden = foot.main !== HOWTO_PLAY;
  if (focus) (next.hidden ? play : next).focus({ preventScroll: true });
}

/** Each open of How to play starts at screen 1, its main button focused. */
export function openHowToPlay(card: HTMLElement): void {
  showHowToScreen(card, 1);
}

/** The How to play card: one card, 1286 x 708 at 1366x768 (mock 2), scaled to the window by `fitHowToPlay`. */
export function howToPlayCard(level: LevelDef): HTMLElement {
  const card = document.createElement("div");
  card.className = "howto-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "How to play");
  card.innerHTML = howToPlayHtml(howToPlayModel(level));
  const move = (to: "next" | "back"): void => showHowToScreen(card, howToStep(Number(card.dataset.screen ?? 1), to));
  card.querySelector(".howto-next")!.addEventListener("click", () => move("next"));
  card.querySelector(".howto-back")!.addEventListener("click", () => move("back"));
  // A held Enter (from the name field, say) presses one button, not Next, Next and "Let's Play!" in a row.
  card.addEventListener("keydown", (event) => {
    if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
  });
  showHowToScreen(card, 1, false);
  return card;
}

/** The card is drawn at 1286 x 708 (mock 2 at 1366x768); it is scaled to fit the window with a 40 x 30 px margin. */
export const HOWTO_SIZE = { width: 1286, height: 708 } as const;

export function howToPlayScale(width: number, height: number): number {
  return Math.min((width - 80) / HOWTO_SIZE.width, (height - 60) / HOWTO_SIZE.height, 1.5);
}

/** Keeps `card` scaled to the window. Returns the way to stop. */
export function fitHowToPlay(card: HTMLElement): () => void {
  const fit = (): void => card.style.setProperty("--howto-scale", howToPlayScale(window.innerWidth, window.innerHeight).toFixed(4));
  fit();
  window.addEventListener("resize", fit);
  return () => window.removeEventListener("resize", fit);
}
