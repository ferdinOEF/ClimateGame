import type { ChallengeDef, ScheduledChallenge } from "@core/climate";
import { HEAT_LEAD_YEARS } from "@core/exposure";
import { CLEAR_TOTAL_STARS } from "@core/panjimIndex";
import type { HouseStars } from "@core/zones";

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
  /** Years before a storm that its heat shows (one in the Tutorial). */
  heatLeadYears?: number;
  /** The level's star lines (Section 25.2): said in words when they count biodiversity. */
  houseStars?: HouseStars;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** A small count in words ("five"), else in figures. */
export const countWord = (n: number): string => WORDS[n] ?? String(n);
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function picture(name: string, alt: string): string {
  return `<img class="panjim-help-pic" src="${import.meta.env.BASE_URL}art/${name}" alt="${esc(alt)}" loading="lazy" decoding="async" draggable="false">`;
}

const pct = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * Section 25.2 (owner decision): the star lines in words, from the level's own numbers, for Help and the final card.
 * Begins "A storm gives"; the caller labels it a game rule.
 */
export function starRule(stars: HouseStars, storms: readonly ChallengeDef[] = []): string {
  const bio = stars.bioTwo !== undefined || stars.bioThree !== undefined;
  if (!bio) return `A storm gives ${stars.one !== undefined ? `one star for saving ${pct(stars.one)} of the homes in its path, ` : "one star, "}two for ${pct(stars.two)} and three for ${pct(stars.three)}.`;
  return `A storm gives one star for ${pct(stars.one ?? 0)} of the homes in its path saved, two for ${pct(stars.two)} and no loss of biodiversity, three for ${pct(stars.three)} and biodiversity up ${stars.bioThree ?? 0}${ownTargets(storms)}.`;
}

/** Section 26.2: a storm with its own three star rise, said after the level's: " (up 40 by the end of 2050)". */
function ownTargets(storms: readonly ChallengeDef[]): string {
  const own = storms.filter((s) => s.bioThree !== undefined);
  return own.length === 0 ? "" : ` (${own.map((s) => `up ${s.bioThree} ${s.biodiversityAtEnd ? "by the end of" : "in"} ${s.year}`).join(", ")})`;
}

const heatLead = (years: number): string => (years === 1 ? "In a storm's own year" : `In the ${countWord(years)} years before a storm`);

const RULE = `<span class="result-rule">Game rule</span>`;

export function panjimHelpHtml(input: PanjimHelpInput): string {
  const years = input.endYear - input.startYear + 1;
  const count = input.storms.length;
  const stormList = input.storms
    .map((storm) => `<li><strong>${esc(storm.name)}</strong>, ${storm.year}: straight after your ${ordinal(storm.turn)} build</li>`)
    .join("");
  // A storm that leaves some tiles alone says so, as a game rule (Section 23.1).
  const shelters = input.storms
    .filter((storm) => storm.shelteredPlace && storm.shelteredTiles && storm.shelteredTiles.length > 0)
    .map((storm) => `<p>In this game, the ${storm.year} storm does not reach ${esc(storm.shelteredPlace!)}.</p>`)
    .join("");
  const stormsTitle = count === 1 ? "The storm" : `${countWord(count).replace(/^./, (c) => c.toUpperCase())} storms`;
  // Section 25.2: the star lines, in words, where they count biodiversity; the Tutorial's one storm counts the homes
  // alone, and says that Panjim's count nature too.
  const countsNature = input.houseStars && (input.houseStars.bioTwo !== undefined || input.houseStars.bioThree !== undefined);
  const starsLine = countsNature
    ? ` In this game ${starRule(input.houseStars!, input.storms).replace(/^A/, "a")}`
    : count === 1
      ? " In this game the stars here count the homes saved. In Play Panjim they count biodiversity too."
      : "";
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
        <p>After each, a result card: ${countsNature ? "stars, homes saved, biodiversity and what protected them" : "the stars, the homes saved, and what protected them"}.${count > 1 ? ` You clear Panjim with at least one star in every storm and ${countWord(CLEAR_TOTAL_STARS)} of the ${countWord(count * 3)} stars in all.` : ""}${starsLine}</p>
        ${shelters}
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
        <p>${heatLead(input.heatLeadYears ?? HEAT_LEAD_YEARS)}, red marks the homes it would flood.</p>
        <p>Show risk (R): the homes the next storm would hit today, counting the defences you have built.</p>
      </div>
    </section>

    <section class="panjim-help-item">
      ${picture("help-cards.jpg", "The build cards for a beach tile: each defence's name and what it does")}
      <div>
        <h3>The cards ${RULE}</h3>
        <p>Each card is one defence. Nature based ones come first. In this game each has a pro and a con, and engineered ones age: the Field Guide gives them.</p>
      </div>
    </section>

    <p class="panjim-help-note">Everything on this page is a rule of this game. The facts about real dunes, mangroves and khazans come with their sources: see Facts &amp; sources on the menu. The pictures are the game's own board; its map data is © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.</p>
  </div>
  </div>
`;
}
