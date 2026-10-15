import type { ScheduledChallenge } from "@core/climate";

/**
 * How to Play for Panjim 2050 (Section 8): one build is one turn is one
 * year, three storms on a fixed calendar. Built from the level's own numbers,
 * so it never disagrees with them. Names no price, income or growing time:
 * coins and growth are off in this version. Everything about what a defence
 * does is a rule of this game.
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

export function panjimHelpHtml(input: PanjimHelpInput): string {
  const years = input.endYear - input.startYear + 1;
  const storms = input.storms.map((storm) => `<li><strong>${esc(storm.name)}</strong> in ${storm.year}, straight after your ${ordinal(storm.turn)} build</li>`).join("");
  return `
  <div class="help-header">
    <div class="help-title">How to Play</div>
    <button type="button" class="help-close" aria-label="Close">&times;</button>
  </div>
  <div class="help-body">

    <section class="help-section">
      <h3>Objective</h3>
      <p>Protect Panjim's homes from ${countWord(input.storms.length)} storms over ${years} years, from ${input.startYear} to ${input.endYear}. Every patch of land is already home to someone. Count the houses you save.</p>
    </section>

    <section class="help-section">
      <h3>A Year at a Time</h3>
      <ol class="help-steps">
        <li><strong>Build.</strong> Click a tile and pick a defence that suits its ground.</li>
        <li><strong>One build, one year.</strong> Each build you make ends the year, and the next year begins. A build you cancel or cannot make changes nothing.</li>
        <li><strong>Weather the storm.</strong> A storm comes straight after your last build before it, in that same year. What you built meets it.</li>
      </ol>
    </section>

    <section class="help-section">
      <h3>The Storms</h3>
      <ul class="help-tips">${storms}</ul>
      <p class="help-note">In the two years before each storm, red tiles show where it will hit hardest.</p>
    </section>

    <section class="help-section">
      <h3>What You Can Build</h3>
      <p class="help-note">Grouped by ground. In this game, every defence is at full strength the day it is built.</p>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Beach</div>
        <div class="help-roster-item"><span>Dune</span><span>Soaks up part of a surge; weakens but is not destroyed.</span></div>
        <div class="help-roster-item"><span>Sandy Vegetation</span><span>Pandanus and creepers. Softens a surge a little.</span></div>
        <div class="help-roster-item"><span>Seawall</span><span>Strong, but fails all at once if a storm is too big for it.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Wetland</div>
        <div class="help-roster-item"><span>Mangrove</span><span>The strongest living defence here. Adds food and biodiversity.</span></div>
        <div class="help-roster-item"><span>Khazan</span><span>Bunds and a sluice. Holds floodwater and adds food.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">River</div>
        <div class="help-roster-item"><span>Small Dam</span><span>Holds back a flood, until a flood is too big for it.</span></div>
        <div class="help-roster-item"><span>Sand Mining</span><span>Lowers biodiversity and makes floods worse.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Near sea</div>
        <div class="help-roster-item"><span>Breakwater</span><span>Sits offshore and weakens a cyclone's waves before the beach.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Beach, Wetland or River</div>
        <div class="help-roster-item"><span>Beachside Resort</span><span>Weakens the shore against storms.</span></div>
        <div class="help-roster-item"><span>Yacht</span><span>Purely for show.</span></div>
      </div>
    </section>

    <section class="help-section">
      <h3>A Few Tips</h3>
      <ul class="help-tips">
        <li>Defend where the red is, before the storm's year ends.</li>
        <li>Mix kinds of defence: in this game, different kinds together do more than many of one kind.</li>
        <li>Don't put all your defence on one stretch of coast.</li>
      </ul>
    </section>

  </div>
`;
}
