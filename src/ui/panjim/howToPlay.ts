import type { LevelDef } from "@levels/levels";
import type { ChallengeKind } from "@core/climate";
import { CARD_ICON, CARD_NAME, cardBiodiversity } from "./defenceCards";
import { leafChip } from "@ui/buildPopover";

/**
 * Section 39.3 (owner decision): How to play, in place of Play Panjim's start popup. The flow is main screen, Play
 * Panjim, the name card, How to play, "Let's Play!", the game. It shows in the start popup's backdrop
 * (ObjectivesPanel), and "Let's Play!" is the popup's old Begin (class `brief-cta`, the same handler), so everything
 * after it is unchanged. Every number on it comes from the level and the element data.
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

export interface HowToPlayModel {
  startYear: number;
  endYear: number;
  /** One build a year: 25 builds in 25 years. */
  builds: number;
  storms: HowToPlayStorm[];
  duneBio: number;
  mangroveBio: number;
  seawallBio: number;
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
    seawallBio: cardBiodiversity("seawall")
  };
}

const svg = (body: string, size = 34): string => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;

/** The cyclone: a ring with two curved arms. */
const CYCLONE = '<circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 8.6 C12 4.6 15 3 18.5 3.6 M12 15.4 C12 19.4 9 21 5.5 20.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
/** The river flood: three wavy lines. */
const FLOOD = '<path d="M3.5 7.5 q2.1-2 4.2 0 t4.2 0 t4.2 0 t4.2 0 M3.5 12.5 q2.1-2 4.2 0 t4.2 0 t4.2 0 t4.2 0 M3.5 17.5 q2.1-2 4.2 0 t4.2 0 t4.2 0 t4.2 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
/** The wind: three lines, two of them curling. */
const WIND = '<path d="M3 9 H14 a3 3 0 1 0 -3 -3 M3 13.5 H18 a3 3 0 1 1 -3 3 M3 18 H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const LEAF = '<path d="M5 19 C5 9 11 4.5 19.5 4.5 C19.5 13 15 19 5 19 Z M5 19 L13 11" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>';
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

const CHEVRON = '<svg class="howto-chevron" viewBox="0 0 12 20" width="12" height="20" aria-hidden="true" focusable="false"><path d="M2 2 L10 10 L2 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The small warning triangle with "!" on each storm. */
const ALERT = '<svg class="howto-alert" viewBox="0 0 20 18" width="18" height="16" aria-hidden="true" focusable="false"><path class="howto-alert-fill" d="M10 1.2 L19 16.8 H1 Z" stroke-linejoin="round"/><path class="howto-alert-mark" d="M10 6.5 V11.3 M10 13.6 V14"/></svg>';

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The How to play card: one card, 1286 x 708 at 1366x768 (mock 2), scaled to the window by `fitHowToPlay`. */
export function howToPlayCard(level: LevelDef): HTMLElement {
  const m = howToPlayModel(level);
  const card = document.createElement("div");
  card.className = "howto-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "How to play");
  const base = import.meta.env.BASE_URL;
  const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
  const storms = m.storms
    .map(
      (s) => `<li class="howto-storm howto-storm-${s.kind}">
        <span class="howto-gap">${s.turns} ${s.turns === 1 ? "turn" : "turns"}</span>
        <span class="howto-storm-icon" role="img" aria-label="${esc(`${s.year} ${s.label}`)}">${svg(KIND_ICON[s.kind], 26)}${ALERT}</span>
        <b class="howto-storm-year">${s.year} ${esc(s.label)}</b>
        <span class="howto-storm-where">${esc(s.where)}</span>
      </li>`
    )
    .join("");
  card.innerHTML = `
    <div class="howto-band"><span>How to play</span><span>Panjim, ${m.startYear} to ${m.endYear}</span></div>
    <div class="howto-body">
      <h2 class="howto-title">It's ${m.startYear}. Three disasters are heading for Panjim. Keep the city standing till ${m.endYear}! <span class="result-rule">Game rules</span></h2>
      <div class="howto-row howto-row-1">
        <section class="howto-box howto-year">
          <div class="howto-box-head"><h3>Each year</h3><span class="howto-box-note">${m.builds} turns or builds in ${m.builds} years</span></div>
          <div class="howto-steps">
            <figure class="howto-step"><div class="howto-step-art">${TILE_PICTURE}</div><figcaption>Click a Tile</figcaption></figure>
            ${CHEVRON}
            <figure class="howto-step"><div class="howto-step-art"><div class="howto-mini-card"><span class="howto-mini-icon">${CARD_ICON.dune}</span><span class="howto-mini-name">${esc(CARD_NAME.dune)}</span></div></div><figcaption>Build a Defense</figcaption></figure>
            ${CHEVRON}
            <figure class="howto-step"><div class="howto-step-art howto-years"><span class="howto-year-from">${m.startYear}</span> → <span class="howto-year-to">${m.startYear + 1}</span></div><figcaption>1 turn = 1 build = 1 year</figcaption></figure>
          </div>
        </section>
        <section class="howto-box howto-map">
          <div class="howto-box-head"><h3>Read the map</h3></div>
          <div class="howto-pictures">
            <figure class="howto-picture"><img src="${base}art/help-heat.jpg" alt="Red striped tiles on the map: the homes the next storm would take" width="150" height="104" draggable="false"><figcaption><b>Red stripes</b>Homes the next storm would take</figcaption></figure>
            <figure class="howto-picture"><img src="${base}art/help-cone.jpg" alt="The storm's path drawn on the map, with the area to protect" width="150" height="104" draggable="false"><figcaption><b>The storm's path</b>Where it lands, and the area to protect</figcaption></figure>
          </div>
        </section>
      </div>
      <section class="howto-box howto-icons">
        <div class="howto-box-head"><h3>Know these icons</h3></div>
        <div class="howto-tiles">
          <div class="howto-tile" role="group" aria-label="Cyclone: waves and surge from the sea"><span class="howto-icon howto-icon-cyclone">${svg(CYCLONE)}</span><b>Cyclone</b><span>Waves and surge from the sea</span></div>
          <div class="howto-tile" role="group" aria-label="River flood: monsoon water down the Mandovi"><span class="howto-icon howto-icon-flood">${svg(FLOOD)}</span><b>River flood</b><span>Monsoon water down the Mandovi</span></div>
          <div class="howto-tile" role="group" aria-label="Wind: comes with every cyclone"><span class="howto-icon howto-icon-wind">${svg(WIND)}</span><b>Wind</b><span>Comes with every cyclone</span></div>
          <div class="howto-tile howto-tile-nature" role="group" aria-label="Biodiversity: nature based defenses add Biodiversity Points; dams and seawalls reduce them">
            <span class="howto-icon howto-icon-nature">${svg(LEAF)}</span>
            <div class="howto-nature-text">
              <div class="howto-nature-head"><b>Biodiversity</b><span class="howto-chips"></span></div>
              <p>Nature based defenses like <b>mangroves</b> and <b>khazans</b> add Biodiversity Points. Some others like <b>dams</b> and <b>seawalls</b> (concrete and metal) reduce Biodiversity Points.</p>
            </div>
          </div>
        </div>
      </section>
      <div class="howto-row howto-row-3">
        <section class="howto-box howto-storms">
          <div class="howto-box-head"><h3>Three storms</h3></div>
          <ol class="howto-timeline">
            <li class="howto-storm howto-start"><span class="howto-start-dot" aria-hidden="true"></span><b class="howto-storm-year">${m.startYear}</b><span class="howto-storm-where">You start</span></li>
            ${storms}
          </ol>
        </section>
        <div class="howto-cta-wrap"><button type="button" class="brief-cta howto-cta">Let's Play!</button></div>
      </div>
    </div>`;
  // The leaf chips from the element data (the build cards' own chip): the dune's, and mangrove's and seawall's.
  card.querySelector(".howto-mini-name")!.after(leafChip(m.duneBio));
  card.querySelector(".howto-chips")!.append(leafChip(m.mangroveBio), leafChip(m.seawallBio));
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
