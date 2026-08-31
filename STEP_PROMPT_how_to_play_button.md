# Khazan — Step Prompt: How to Play Button

**What it is:** a small "?" button in the top-right corner that opens the player manual in a new tab. The manual itself is already written and published — this step only wires up the in-game button that links to it.

**Manual URL:** `https://claude.ai/code/artifact/80fe2ad5-e961-45e6-b2cc-b10ecab61a7b`

---

## Confirmed in the current code

`hud.ts`: the top-right corner already holds the "Tiles claimed" counter, built at construction time:

```ts
const tileCounter = document.createElement("div");
tileCounter.className = "hud-corner top-right";
tileCounter.innerHTML = `<div>Tiles claimed</div><div class="tile-count-value">0</div>`;
container.appendChild(tileCounter);
this.tileCountEl = tileCounter.querySelector(".tile-count-value")!;
```

`hud.css`: `.hud-corner.top-right` (`top: calc(12px + env(safe-area-inset-top)); right: calc(12px + env(safe-area-inset-right)); text-align: right;`) and the base `.hud-corner` rule (`pointer-events: none;` — every corner is click-through by default, individual controls opt back in, same pattern `.preview-toggle` and the instrument cluster's collapse toggle already use).

## The change

Add the button as a new child inside the same `top-right` corner element, above the tile counter, rather than creating a second corner widget or a new CSS anchor:

```ts
tileCounter.innerHTML = `
  <button type="button" class="help-button" aria-label="How to play">?</button>
  <div>Tiles claimed</div>
  <div class="tile-count-value">0</div>
`;
tileCounter.querySelector(".help-button")!.addEventListener("click", () => {
  window.open(
    "https://claude.ai/code/artifact/80fe2ad5-e961-45e6-b2cc-b10ecab61a7b",
    "_blank",
    "noopener,noreferrer"
  );
});
```

New CSS rule in `hud.css`, near the other small corner controls:

```css
.help-button {
  pointer-events: auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(20, 30, 26, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fdf6e6;
  font-family: inherit;
  font-weight: 700;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  margin-bottom: 6px;
}

.help-button:hover,
.help-button:focus-visible {
  background: rgba(20, 30, 26, 0.95);
  border-color: rgba(255, 255, 255, 0.3);
}
```

That's the whole change — one button, one click handler, one CSS rule. No new HUD corner, no layout shift for the tile counter beyond the button sitting above it.

## Verify

- Top-right corner shows a small round "?" button above "Tiles claimed," on both desktop and the 375×667 mobile breakpoint.
- Clicking it opens the manual in a new tab; the game itself is untouched underneath (no navigation away, no popup blocked silently — confirm the tab actually opens).
- `tsc --noEmit` clean.
- `PROGRESS.md` gets the usual one-line entry.
