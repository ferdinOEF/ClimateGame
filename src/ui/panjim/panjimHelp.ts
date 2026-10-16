import type { ScheduledChallenge } from "@core/climate";
import { HEAT_LEAD_YEARS } from "@core/exposure";

/**
 * How to Play for the Panjim game (Section 15): a short page in the result
 * cards' brown, one small picture per idea, each picture a render of the game
 * itself (public/art/help-*.jpg, made by tools/shellArt.ts). Built from the
 * level's own numbers, so it never disagrees with them: the Tutorial's page
 * says three builds and one cyclone, Panaji's twenty-five and three storms.
 *
 * Everything on it is a rule of this game, and says so. The facts Maya tells
 * about real defences carry their own sources (Facts & sources).
 */
export interface PanjimHelpInput {
  startYear: number;
  endYear: number;
  storms: readonly ScheduledChallenge[];
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six"];
const countWord = (n: number): string => WORDS[n] ?? String(n);
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function picture(name: string, alt: string): string {
  return `<img class="panjim-help-pic" src="${import.meta.env.BASE_URL}art/${name}" alt="${esc(alt)}" loading="lazy" decoding="async" draggable="false">`;
}

const RULE = `<span class="result-rule">Game rule</span>`;

export function panjimHelpHtml(input: PanjimHelpInput): string {
  const years = input.endYear - input.startYear + 1;
  const count = input.storms.length;
  const stormList = input.storms
    .map((storm) => `<li><strong>${esc(storm.name)}</strong>, ${storm.year}: straight after your ${ordinal(storm.turn)} build</li>`)
    .join("");
  const stormsTitle = count === 1 ? "The storm" : `${countWord(count).replace(/^./, (c) => c.toUpperCase())} storms`;
  return `
  <div class="panjim-help">
  <div class="help-header">
    <div class="help-title">How to play</div>
    <button type="button" class="help-close" aria-label="Close">&times;</button>
  </div>
  <div class="help-body panjim-help-body">

    <section class="panjim-help-item">
      ${picture("help-clock.jpg", "The year at the top of the screen, with the next storm and the homes at risk")}
      <div>
        <h3>One build a year ${RULE}</h3>
        <p>Click a tile and pick a card. That build ends the year. ${years} builds, ${input.startYear} to ${input.endYear}.</p>
      </div>
    </section>

    <section class="panjim-help-item">
      ${picture("help-result.jpg", "A storm's result card")}
      <div>
        <h3>${stormsTitle} ${RULE}</h3>
        <ul>${stormList}</ul>
        <p>After each, a result card: the stars, the homes saved, and what protected them.</p>
      </div>
    </section>

    <section class="panjim-help-item">
      ${picture("help-cone.jpg", "The forecast cone over the board, with the area to protect outlined")}
      <div>
        <h3>The cone ${RULE}</h3>
        <p>When a storm's years begin, the cone shows where it may go and the area to protect. It goes with your first build; a faint outline then marks the homes still at risk.</p>
      </div>
    </section>

    <section class="panjim-help-item">
      ${picture("help-heat.jpg", "Red striped tiles: homes the coming storm would flood")}
      <div>
        <h3>The heat ${RULE}</h3>
        <p>In the ${countWord(HEAT_LEAD_YEARS)} years before a storm, red marks the homes it would flood.</p>
      </div>
    </section>

    <section class="panjim-help-item">
      ${picture("help-cards.jpg", "The build cards for a beach tile, each with how many homes it protects")}
      <div>
        <h3>The numbers on the cards ${RULE}</h3>
        <p>Each card says how many homes it protects here from the next storm, worked out the way the storm itself is. Pick the biggest.</p>
      </div>
    </section>

    <p class="panjim-help-note">Everything on this page is a rule of this game. What Maya tells you about real dunes, mangroves and khazans comes with its source: see Facts &amp; sources on the menu.</p>
  </div>
  </div>
`;
}
