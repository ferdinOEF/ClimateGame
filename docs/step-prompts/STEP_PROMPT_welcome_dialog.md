# Root & Ruin — Step Prompt: Welcome Dialog (Laterite Earth)

**What it is:** a dialog shown on game load, before the player does anything else — "Root & Ruin," a short welcome line, a pointer to the "?" help button, and a big "IKUZO!" button that closes it. A small &times; in the corner closes it too. Style and copy are both finalized (reviewed and approved in chat as concept mockups) — this is an implementation pass, not a design pass.

**Content is final, use verbatim:**

- Title: `Root & Ruin`
- Body: `Nature's coming, are you ready? Grow your coast, plant your defenses, and see if your little slice of Goa can survive the fury of the sea.`
- Help line: `Need help with the game? Click the '?' button on the top right corner.`
- Button: `IKUZO!`

---

## Reuse the existing modal pattern

Same backdrop-and-card mechanism as `EraEndScreen` and the recently-built `HelpModal`: a full-viewport backdrop (`hidden` toggled, never a competing `display` override — see `hud.css`'s own comment on that trap, hit three times already in this file), a centered card. Also reuse `BuildPopover`/`HelpModal`'s click-outside-to-close behavior (`e.target === this.backdrop`).

**Deliberately does not reuse the green HUD card language.** Approved as its own visual moment — a rust-red "laterite" palette (Goa's real soil color), separate from the green/cream card language every other dialog in the game uses. Don't restyle `HelpModal` or anything else to match this — scope is this one dialog only.

## New file: `src/ui/welcomeModal.ts`

```ts
/**
 * Shown once per game load, before anything else — a title moment, not a
 * gameplay dialog. Static content, no game-state coupling, same reasoning
 * as HelpModal: no wiring through main.ts beyond construction + one show()
 * call. IKUZO and the corner × both just close it — there's no separate
 * "start" action since the game underneath is already loaded and playable.
 */
export class WelcomeModal {
  private backdrop: HTMLElement;

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "welcome-backdrop";
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.hide();
    });

    const card = document.createElement("div");
    card.className = "welcome-card";
    card.innerHTML = `
      <button type="button" class="welcome-close" aria-label="Close">&times;</button>
      <div class="welcome-title">Root &amp; Ruin</div>
      <p class="welcome-body">Nature's coming, are you ready? Grow your coast, plant your defenses, and see if your little slice of Goa can survive the fury of the sea.</p>
      <p class="welcome-help">Need help with the game? Click the '?' button on the top right corner.</p>
      <button type="button" class="welcome-cta">IKUZO!</button>
    `;
    card.querySelector(".welcome-close")!.addEventListener("click", () => this.hide());
    card.querySelector(".welcome-cta")!.addEventListener("click", () => this.hide());

    this.backdrop.appendChild(card);
    container.appendChild(this.backdrop);
  }

  show(): void {
    this.backdrop.hidden = false;
  }

  hide(): void {
    this.backdrop.hidden = true;
  }
}
```

## Wire it into `main.ts`

Construct once alongside the other top-level UI, then show it immediately after the rest of the HUD/UI has been built (so it draws on top of an already-assembled screen, not a half-built one):

```ts
const welcomeModal = new WelcomeModal(container);
// ...after hud, buildPopover, helpModal, etc. are all constructed:
welcomeModal.show();
```

**Shows on every load, not just the first ever visit** — no localStorage/dismissal-memory logic. If you want "only show once, ever" instead, that's a real behavior change worth flagging back rather than assuming.

## New CSS in `hud.css`

```css
.welcome-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(8, 6, 6, 0.74);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.welcome-backdrop[hidden] {
  display: none;
}

.welcome-card {
  position: relative;
  width: min(340px, 92vw);
  padding: 26px 24px 22px;
  border-radius: 14px;
  text-align: center;
  color: #fbeed9;
  background: linear-gradient(160deg, #6e2c16 0%, #3c1509 100%);
  border: 1px solid rgba(230, 178, 104, 0.4);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5);
}

.welcome-close {
  position: absolute;
  top: -12px;
  right: -12px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(230, 178, 104, 0.4);
  color: #fbeed9;
  pointer-events: auto;
}

.welcome-title {
  font-family: "Fraunces", Georgia, serif;
  font-size: 24px;
  font-weight: 700;
  color: #f4d9a6;
  margin-bottom: 10px;
}

.welcome-body {
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.92;
  margin: 0 0 14px;
}

.welcome-help {
  font-size: 11px;
  opacity: 0.68;
  margin: 0 0 18px;
}

.welcome-cta {
  width: 100%;
  padding: 13px;
  border-radius: 999px;
  border: 2px solid #e6b268;
  background: transparent;
  color: #f4d9a6;
  font-family: inherit;
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.04em;
  cursor: pointer;
  pointer-events: auto;
}

.welcome-cta:hover,
.welcome-cta:focus-visible {
  background: rgba(230, 178, 104, 0.12);
}

@media (max-width: 560px) {
  .welcome-close {
    top: 10px;
    right: 10px;
  }
}
```

**One new font, deliberately:** the title uses "Fraunces" (a display serif), not the game's usual system-UI stack — this was part of the approved concept and is what gives the title its weight. Add it once, globally, in `index.html`'s `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&display=swap" rel="stylesheet">
```

If `index.html` already loads fonts a different way (a local `@font-face`, a bundler plugin), match that existing convention instead of adding a second, inconsistent font-loading method — the goal is Fraunces rendering on `.welcome-title`, not this exact `<link>` tag specifically.

**Mobile note:** the &times; sits outside the card's top-right corner on desktop (an intentional "badge" look, matches the approved concept) but that overflow risks clipping against the viewport edge on a narrow phone — the media query above pulls it back inside the card below 560px. Verify this actually looks right at 375&times;667, don't just trust the number.

---

## Guardrails

- Don't touch `HelpModal`, `EraEndScreen`, or any other dialog's styling — this palette is scoped to the welcome dialog only.
- Content is final as written above — don't edit copy while implementing.
- No localStorage/"seen it once" logic unless you flag back and get a decision — default is: shows every load.

## Verify

- On a fresh load, the dialog appears centered over the fully-built game screen (not a blank/half-loaded one behind it).
- Clicking "IKUZO!" closes it; clicking the &times; closes it; clicking the dimmed backdrop outside the card closes it; clicking inside the card does not.
- Title renders in the Fraunces serif, not the game's default system font — confirm the font actually loaded (check the network tab / computed font-family, not just that it "looks serif-ish").
- Looks correct at 375&times;667 specifically, including the corner &times; not clipping off-screen.
- `tsc --noEmit` clean.
- `PROGRESS.md` gets the usual entry.
