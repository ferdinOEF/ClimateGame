# Khazan — Step Prompt: How to Play Button (in-game dialog, not an external link)

**This replaces the earlier version of this file.** The first pass wired the "?" button to `window.open()` an external URL — wrong call for a game: it punts the player out of the browser tab entirely, no return path, no visual continuity. If that version already landed in the codebase, rip out the `window.open` call and the URL along with it as part of this pass. The correct design is an in-game dialog: click "?", a "How to Play" card opens over the game, click the close button (or click outside it) and you're back exactly where you were.

**Do not link to any external URL.** All manual content lives in the dialog itself, as real DOM content, styled to match the rest of the HUD — not an iframe, not a new tab, not a redirect.

---

## Reuse the modal pattern that already exists — don't invent a new one

`EraEndScreen` (`src/ui/eraEndScreen.ts` + `hud.css`'s `.era-end-backdrop`/`.era-end-card`) is already exactly this shape: a full-viewport backdrop, a centered card, dark-translucent HUD styling. `BuildPopover`'s backdrop additionally closes on any click outside the card (`this.backdrop.addEventListener("click", (e) => { if (e.target === this.backdrop) this.hide(); })` — `buildPopover.ts` line 60). The Help dialog needs both behaviors combined: `EraEndScreen`'s centered-card layout, `BuildPopover`'s click-outside-to-close. Follow both precedents exactly rather than reinventing backdrop/card mechanics.

## New file: `src/ui/helpModal.ts`

```ts
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
        <div class="help-roster-item"><span>Dune</span><span>Cheap. Soaks up wave energy, slowly rebuilds itself.</span></div>
        <div class="help-roster-item"><span>Sandy Vegetation</span><span>Roots grip the sand, blunt an incoming surge.</span></div>
        <div class="help-roster-item"><span>Seawall</span><span>Blocks waves hard, works immediately. Fails all at once if overwhelmed.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Estuary</div>
        <div class="help-roster-item"><span>Mangrove</span><span>The strongest natural defense. Also feeds people and biodiversity.</span></div>
        <div class="help-roster-item"><span>Khazan</span><span>Old bund-and-sluice system. Holds back floodwater, grows rice and fish.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">River</div>
        <div class="help-roster-item"><span>Small Dam</span><span>Holds back floodwater, pays for itself. Skip upkeep and it weakens.</span></div>
        <div class="help-roster-item"><span>Sand Mining</span><span>Fast money, at the riverbank's expense.</span></div>
      </div>

      <div class="help-roster-group">
        <div class="help-roster-terrain">Coast</div>
        <div class="help-roster-item"><span>Breakwater</span><span>Sits offshore, breaks a wave's power before it reaches land.</span></div>
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
      <div class="help-meter"><span>Biodiversity</span><span>Rises with nature-based defenses, falls with engineered ones.</span></div>
      <div class="help-meter"><span>Trust</span><span>Your people's confidence in you. Damaged buildings cost you here.</span></div>
    </section>

    <section class="help-section">
      <h3>Two Threats</h3>
      <div class="help-threat"><strong>Cyclone</strong> &mdash; rolls in off the sea, hits the coast first. Beach defenses matter most.</div>
      <div class="help-threat"><strong>Flood</strong> &mdash; rises from upriver, flows toward the estuary. River and estuary defenses hold it back.</div>
    </section>

    <section class="help-section">
      <h3>A Few Tips</h3>
      <ul class="help-tips">
        <li>Nature-based defenses take time to mature. Plant early.</li>
        <li>Don't put all your defense on one stretch of coast.</li>
        <li>Watch your Food &mdash; a hungry population costs you before you notice.</li>
      </ul>
    </section>

  </div>
`;
```

## Wire it into `Hud`, not `main.ts`

In `hud.ts`, alongside the existing top-right `tileCounter` construction: instantiate `new HelpModal(container)`, and point the "?" button's click handler at `helpModal.show()` instead of `window.open(...)`.

```ts
import { HelpModal } from "./helpModal";
// ...
const helpModal = new HelpModal(container);

tileCounter.innerHTML = `
  <button type="button" class="help-button" aria-label="How to play">?</button>
  <div>Tiles claimed</div>
  <div class="tile-count-value">0</div>
`;
tileCounter.querySelector(".help-button")!.addEventListener("click", () => {
  helpModal.show();
});
```

No changes needed in `main.ts` — this never touches game state, so it doesn't need to go through `refreshHud()` or any of the other wiring `EraEndScreen` needs.

## New CSS in `hud.css`

Keep `.help-button` from the prior pass (28px circle, `pointer-events: auto`, same dark-card language) — that part was fine, only the click behavior was wrong. Add:

```css
.help-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(10, 16, 14, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.help-backdrop[hidden] {
  display: none;
}

.help-card {
  background: rgba(20, 30, 26, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  width: min(520px, 92vw);
  max-height: 85vh;
  overflow-y: auto;
  color: #fdf6e6;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.help-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  background: rgba(20, 30, 26, 0.96);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.help-title {
  font-size: 18px;
  font-weight: 700;
}

.help-close {
  pointer-events: auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fdf6e6;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.help-close:hover,
.help-close:focus-visible {
  background: rgba(255, 255, 255, 0.16);
}

.help-body {
  padding: 4px 22px 22px;
}

.help-section {
  margin-top: 20px;
}

.help-section h3 {
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(253, 246, 230, 0.7);
  margin: 0 0 8px;
}

.help-section p {
  font-size: 14px;
  margin: 0 0 8px;
}

.help-note {
  font-size: 12.5px;
  color: rgba(253, 246, 230, 0.6);
}

.help-steps {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.help-roster-group {
  margin-top: 10px;
}

.help-roster-terrain {
  font-size: 12px;
  font-weight: 700;
  color: #8fbf3e;
  margin-bottom: 4px;
}

.help-roster-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13.5px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.help-roster-item span:first-child {
  font-weight: 600;
  white-space: nowrap;
}

.help-roster-item span:last-child {
  color: rgba(253, 246, 230, 0.75);
  text-align: right;
}

.help-meter {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13.5px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.help-meter span:first-child { font-weight: 600; }
.help-meter span:last-child { color: rgba(253, 246, 230, 0.75); text-align: right; }

.help-threat {
  font-size: 13.5px;
  margin-bottom: 6px;
}

.help-tips {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (max-width: 560px) {
  .help-card {
    width: 100vw;
    max-height: 100vh;
    border-radius: 0;
  }
  .help-roster-item,
  .help-meter {
    flex-direction: column;
    gap: 2px;
  }
  .help-roster-item span:last-child,
  .help-meter span:last-child {
    text-align: left;
  }
}
```

---

## Guardrails

- No external URL anywhere in this feature. All content lives in `HELP_CONTENT`.
- Don't touch `EraEndScreen` or `BuildPopover` themselves — copy their pattern, don't modify the originals.
- Content is final as written above — don't add or cut sections without flagging back.

## Verify

- Clicking "?" opens the dialog over the game, game visibly dimmed behind it, no navigation and no new tab.
- Clicking the &times; closes it and the game is exactly as it was.
- Clicking the dimmed backdrop (outside the card) also closes it; clicking inside the card does not.
- Dialog scrolls internally on a short viewport rather than overflowing the screen; full-width sheet on the 375&times;667 mobile breakpoint.
- `tsc --noEmit` clean.
- `PROGRESS.md` gets the usual entry, noting this supersedes the earlier external-link version if that one had already landed.
