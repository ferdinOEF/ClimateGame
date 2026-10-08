/**
 * The in-game "How to Play" reference. Static content, no game-state
 * coupling — unlike EraEndScreen (which needs an onStartNewEra callback
 * into main.ts), this never needs to reach outside itself, so Hud can own
 * an instance directly with no wiring through main.ts at all.
 *
 * Modal mechanics follow two existing precedents exactly:
 * - EraEndScreen: full-viewport backdrop + centered card, same dark HUD
 *   card language, same `[hidden]` handling (`hidden` on the backdrop,
 *   never on the card — see hud.css's own comment on why an unconditional
 *   `display` anywhere in this chain silently defeats `[hidden]`).
 * - BuildPopover: the backdrop also closes on a click that lands on the
 *   backdrop itself (`e.target === this.backdrop`), not just via the
 *   close button.
 */
export class HelpModal {
  private backdrop: HTMLElement;
  private card: HTMLElement;

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "help-backdrop";
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.hide();
    });

    this.card = document.createElement("div");
    this.card.className = "help-card";
    this.card.innerHTML = HELP_CONTENT;
    this.card.querySelector(".help-close")!.addEventListener("click", () => this.hide());

    this.backdrop.appendChild(this.card);
    container.appendChild(this.backdrop);
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  show(): void {
    this.backdrop.hidden = false;
  }

  hide(): void {
    this.backdrop.hidden = true;
  }
}

const HELP_CONTENT = `
  <div class="help-header">
    <div class="help-title">How to Play</div>
    <button type="button" class="help-close" aria-label="Close">&times;</button>
  </div>
  <div class="help-body">

    <section class="help-section">
      <h3>Objective</h3>
      <p>Build a coastal town that survives. Every tile you claim either strengthens your defenses or grows your economy &mdash; usually not both. Balance the two, and hold the line when a Cyclone or a Flood arrives.</p>
    </section>

    <section class="help-section">
      <h3>The Loop</h3>
      <ol class="help-steps">
        <li><strong>Claim land.</strong> Click any unclaimed tile. Costs Coin, reveals the terrain.</li>
        <li><strong>Build.</strong> Click a claimed tile to choose one element suited to that terrain.</li>
        <li><strong>Weather the hazard.</strong> Cyclones and Floods strike on their own schedule. What you've built absorbs the hit, or doesn't.</li>
        <li><strong>Recover and grow.</strong> Check your meters, repair what broke, keep expanding.</li>
      </ol>
    </section>

    <section class="help-section">
      <h3>What You Can Build</h3>
      <p class="help-note">Grouped by terrain &mdash; exactly what you'll see when you click a tile.</p>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Beach</div>
        <div class="help-roster-item"><span>Dune</span><span>Cheap. Soaks up part of a surge; weakens but is not destroyed.</span></div>
        <div class="help-roster-item"><span>Sandy Vegetation</span><span>The cheapest defence. Softens a surge a little.</span></div>
        <div class="help-roster-item"><span>Seawall</span><span>Strong at once. Fails all at once if a storm is too big for it.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Estuary</div>
        <div class="help-roster-item"><span>Mangrove</span><span>The strongest living defence here. Adds food and biodiversity.</span></div>
        <div class="help-roster-item"><span>Khazan</span><span>Bunds and a sluice. Holds floodwater and adds food.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">River</div>
        <div class="help-roster-item"><span>Small Dam</span><span>Holds back a flood and earns Coin, until a flood is too big for it.</span></div>
        <div class="help-roster-item"><span>Sand Mining</span><span>Fast Coin; lowers biodiversity and resilience.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Coast</div>
        <div class="help-roster-item"><span>Breakwater</span><span>Sits offshore and weakens a cyclone's waves before the beach.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Land</div>
        <div class="help-roster-item"><span>House</span><span>Steady income, growing population. Feeds off your Food supply.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Beach, Estuary or River</div>
        <div class="help-roster-item"><span>Beachside Resort</span><span>Strong income, weakest-defended tile you can build.</span></div>
        <div class="help-roster-item"><span>Yacht</span><span>The most expensive build in the game. Purely for show.</span></div>
      </div>
    </section>

    <section class="help-section">
      <h3>Reading Your Meters</h3>
      <div class="help-meter"><span>Coin</span><span>Spend it to claim and build. Earned back through income elements.</span></div>
      <div class="help-meter"><span>Resilience</span><span>Your settlement's overall defense. Runs out, the era ends.</span></div>
      <div class="help-meter"><span>Food</span><span>Produced by Mangrove and Khazan, consumed by every House.</span></div>
      <div class="help-meter"><span>Population</span><span>Grows with Houses. Falls if people go hungry or unprotected.</span></div>
      <div class="help-meter"><span>Biodiversity</span><span>Rises with living defences, falls with built ones.</span></div>
      <div class="help-meter"><span>Trust</span><span>Your people's confidence in you. Damaged buildings cost you here.</span></div>
    </section>

    <section class="help-section">
      <h3>Two Threats</h3>
      <div class="help-threat"><strong>Cyclone</strong> &mdash; comes in off the sea and hits the coast first. Beach defences matter most here.</div>
      <div class="help-threat"><strong>Flood</strong> &mdash; comes down the river toward the estuary. River and estuary defences hold it back here.</div>
    </section>

    <section class="help-section">
      <h3>A Few Tips</h3>
      <ul class="help-tips">
        <li>Living defences take time to grow. Plant early.</li>
        <li>Don't put all your defense on one stretch of coast.</li>
        <li>Watch your Food &mdash; a hungry population costs you before you notice.</li>
      </ul>
    </section>

  </div>
`;
