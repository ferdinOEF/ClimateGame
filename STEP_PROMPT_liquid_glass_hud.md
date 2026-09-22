# Khazan — Step Prompt: Liquid-glass build menu, HUD, and the bugs blocking it

**Status:** proposal, ready to implement. Written after a hands-on Chrome playtest of the live deployed build (`climate-game-psi.vercel.app/?debughazards`) and a live interactive comparison artifact built to demonstrate the target interaction directly rather than describe it: Khazan Interface Study — https://claude.ai/artifact/BnCsaiNd9RGfmeQ9wCCb3p. Open it before starting; every timing value and easing curve below is copied straight out of its CSS, not re-derived from memory.

Per `GAUNTLET_PROMPT.md` §0.1 and `NEXT_STEPS.md`'s own Bucket-A-before-Bucket-B rule: the bugs in Section 1 block Section 2 conceptually (there's no point polishing motion on top of a build menu that sometimes silently does nothing), so fix Section 1 first, verified, before starting Section 2.

---

## 0. Why this doc exists, and a discrepancy worth flagging up front

`NEXT_STEPS.md`'s own Log says camera zoom was closed and confirmed: "Scroll wheel zooms the camera in/out smoothly... Previously marked 'not verified/may not exist, low priority' — now confirmed working." Live, right now, on `?debughazards`, scroll-wheel zoom does nothing. That's not a doc making an unverified claim — it's a doc claiming a live-verified pass that the currently deployed build contradicts. Two explanations: a regression since that pass, or the deployed build isn't actually running the commit that log entry describes. Please check which before doing anything else — `git log`/`git blame` on the zoom handler, and confirm what's actually live vs. what's in the log. Note the answer in this doc's own Verify section when done; it matters for how much weight to put on other "closed" log entries going forward.

Similarly: `STEP_PROMPT_map_reshape_veg_icons.md` documents a Mangrove redesign (3-clump cluster, 4-strut stilt roots, two-tone canopy per clump) as already implemented. The live build's Mangrove renders as a small, crude, blobby pinecone-on-a-stick that doesn't match that description at all. Same question applies — confirm whether that redesign is actually in the commit that's deployed, and either it's missing (finish shipping it, no new design work needed — the spec already exists) or it's present and simply not reading well at in-game scale/lighting (a legibility bug, handle like `STEP_PROMPT_icon_legibility_pass.md`'s tint-multiply fixes).

---

## 1. Fix first — correctness bugs found live

### 1.1 Scroll-wheel zoom non-functional

See Section 0. Diagnose fresh rather than assuming the old fix regressed — check what's actually live first.

### 1.2 "Tiles claimed" HUD stat appears frozen

Observed live: a "Tiles claimed" counter stayed at its initial value (198) across multiple claims in the same session, while a separate "N hexes still empty" counter updated correctly on every claim in that same session. Find where "Tiles claimed" is computed/bound in the HUD code and either wire it to the same claim event the empty-hex counter already listens to, or — if it's intentionally a different, non-live figure — rename it so it doesn't read as a live counter.

### 1.3 Silent no-op tapping a distant/ineligible tile

Tapping a tile far from any claimed tile produced no visible response at all — no feedback, no error, nothing. This may be entirely correct rejection logic (e.g. Coast terrain, or out-of-claim-range), but there's currently zero UX signal explaining why the tap did nothing, and the in-game Help text doesn't mention the exception if one exists. Add a brief rejection affordance (a short shake on the tile, or a small transient tooltip naming the reason — "not reachable yet" / "Coast can't be built on", whichever is actually true) so a tap always produces some visible response. Fix Help copy to match once the real rule is confirmed.

### 1.4 Mangrove visual mismatch

See Section 0. Resolve per that section — either finish shipping the already-speced redesign, or treat it as a fresh legibility bug on top of an already-present redesign (re-check the tint-multiply gotcha per `STEP_PROMPT_icon_legibility_pass.md` either way).

### 1.5 Minor / confirm-only

- `IKUZO!` as the welcome dialog's confirm button doesn't fit the Goa coastal setting tonally — swap for plain, in-setting copy ("Begin", "Start", or similar).
- A "Carbon" HUD stat is present live but isn't part of the documented five-meter schema in `GAUNTLET_PROMPT.md`. Confirm whether it's intentional (and if so, get it documented) or a leftover from an earlier iteration (and if so, remove it).

---

## 2. The build-menu and HUD redesign — port directly from the artifact

Confirmed direction: liquid-glass, radial, spring-eased. This is a port, not a fresh design — open https://claude.ai/artifact/BnCsaiNd9RGfmeQ9wCCb3p and read its `#stageB`/`.hud-glass`/`.radial`/`.chip`/`.pill` CSS directly; the values below are the same ones, called out so they survive the translation to the engine's actual DOM/CSS layer (this is UI chrome, not Three.js geometry — it belongs alongside `BuildPopover`'s existing DOM overlay, not in the 3D scene).

### 2.1 Anchor the build menu to the tapped tile, not a fixed screen corner

Replace `BuildPopover`'s current fixed-position placement with a position computed from the tapped tile's screen-space projection (the same `camera.project()` mechanism already proposed in `STEP_PROMPT_isometric_diegetic_ui.md` §3 for diegetic status panels — reuse that projection utility rather than writing a second one).

### 2.2 Radial layout

For N options (today: 2–3 per terrain, comfortably inside the "small option count" case radial menus are built for), spread chips across a 130° arc centered above the tile, at 108px radius:

```
angle_i = -65° + (130° / (N-1)) * i        // for N > 1; single-option case just centers above
tx = cos(angle_i) * 108
ty = sin(angle_i) * 108
```

Each chip is a translucent glass card: `backdrop-filter: blur(12px) saturate(1.4)`, `background: rgba(24,46,40,.55)`, `border: 1px solid rgba(255,255,255,.18)`, `border-radius: 12px`.

### 2.3 Spring entrance, not a cut

Chips enter via `cubic-bezier(.22, 1.7, .32, 1)` (genuine overshoot — it bounces slightly past full size before settling), staggered 70ms apart per chip, ~500ms duration. This single curve is most of what reads as "fluid" rather than "instant" — it's the one change worth getting exactly right rather than approximating.

### 2.4 Glass HUD panel

Replace the opaque HUD box with `background: rgba(20,40,34,.42)`, `backdrop-filter: blur(14px) saturate(1.3)`, `border: 1px solid rgba(255,255,255,.14)`, `border-radius: 14px`. Use the small inline stat icons (coin/shield/leaf/grain — simple flat SVG glyphs, see the artifact's `ICONS`-adjacent constants) instead of bare numbers with no icon. Keep this panel's glass values consistent with whatever glass-panel spec `STEP_PROMPT_isometric_diegetic_ui.md` ends up using for its world-anchored status readouts, if that lands too — one "material," reused everywhere translucency shows up, not two different glass recipes in the same game.

### 2.5 Diegetic build confirmation

On confirm: the built element's icon plays a squash-and-stretch settle (scale sequence `.3,1.7 → 1.32,.72 → .92,1.1 → 1.04,.97 → 1,1` over ~620ms — reuse whatever `SettleAnimator` already exposes for this shape of animation rather than a new one-off), the HUD panel gets one soft pulse (a box-shadow ring expanding and fading, ~700ms), and a small floating pill shows the actual stat delta in words ("+biodiversity +3 · +food +1") that grows in, holds legibly for roughly a third of a second, then fades — grow→hold→fade, the same shape already validated for creature reactions in `STEP_PROMPT_creature_reactions.md`, applied here to UI feedback instead of wildlife.

---

## 3. Verification protocol for this pass — ship in small pieces, verify each one live

This is the part that's new relative to prior passes, in response to the zoom-regression discrepancy in Section 0: don't batch this whole doc into one change and report back once at the end.

- Work one numbered item at a time (1.1, 1.2, 1.3, 1.4, 1.5, then 2.1 through 2.5 in order — 2.x depends on 1.x being solid per §0.1's sequencing rule).
- After each item, push to a feature branch rather than only to whatever branch deploys straight to production. Vercel's git integration creates a unique preview URL for every branch push automatically — no extra setup needed on your end beyond pushing to a branch instead of main.
- Report that preview URL back (in the `NEXT_STEPS.md` Log entry for that item, and to the user directly) before merging to main or starting the next item.
- A separate session with live browser access will open that exact preview URL and independently confirm the specific behavior that item claims to fix — the same method that caught the zoom regression and the Mangrove mismatch in the first place, just applied per-change instead of per-batch this time. Treat a Verify step as done only once that external confirmation has actually happened, per `NEXT_STEPS.md`'s own existing rule — this just adds a second set of eyes to it.
- Only merge to main / let something reach the production URL after its preview URL has been confirmed.

---

## 4. Explicitly out of scope for this pass

- Blender / any organic-mesh authoring pipeline. Discussed, not yet greenlit — do not start this as part of this doc.
- The isometric camera rework in `STEP_PROMPT_isometric_diegetic_ui.md`. Related (shares the glass-panel visual language per §2.4 above) but a separate, not-yet-approved piece of work — don't fold it into this pass.
- Economy/hazard rebalancing, `elements.json` changes, anything outside the build-menu/HUD interaction and the five listed bugs.
- A general idle-sway/ambient-motion pass beyond what's specified above.

---

## Verify

- [x] Section 0's zoom discrepancy explained (regression vs. stale deploy) and noted here.
  **Neither** — confirmed live against `climate-game-psi.vercel.app/?debughazards` with Playwright
  (not the flaky Claude_Browser pane): the deployed build is current (has the welcome dialog, and
  every `__xxxForTest` hook through the creature-reactions pass, confirming it's running at or very
  near HEAD, not a stale commit). The zoom handler itself is untouched since `1971088` and works
  exactly as coded: `__cameraForTest.position` was **byte-identical** before and after a wheel
  event fired while the "Root & Ruin" welcome dialog (added in a later, unrelated pass) was still
  open — its full-viewport backdrop legitimately intercepts all pointer/wheel input while open, by
  design, the same as it's supposed to block clicks. Once dismissed, an identical wheel event moved
  the camera exactly as expected (Y: 15.26 → 8.48, matching `CAM_DISTANCE_MIN`). So: zoom was never
  broken and never regressed — the live playtest almost certainly scrolled to test the map before
  clicking "IKUZO!", which the modal (correctly) ate. Not filed as a "1.1 fix" since there's no bug
  in the zoom code to fix; noted here instead. Worth deciding whether a first-load modal should ever
  visibly/audibly hint that scroll won't do anything while it's up, but that's a UX call, not a bug.
  Mangrove checked the same way: built one live via `__buildForTest` and screenshotted it. The
  3-clump-cluster/stilt-root/two-tone-canopy redesign from `STEP_PROMPT_map_reshape_veg_icons.md`
  **is** deployed and matches its own construction exactly — it's real, present code, not a missing
  or stale deploy. It just doesn't read well at actual gameplay zoom: the two-tone highlight reads
  as ordinary flat-shading facet variance rather than a deliberate two-tone canopy, and the thin
  stilt roots are essentially invisible at this scale — a legibility problem, the second of the two
  outcomes this section anticipated. Item 1.4 below is scoped as a legibility pass, not a re-ship.
- [ ] 1.1–1.5 each independently confirmed live via their own preview URL before 2.x starts.
- [ ] 2.1–2.5 each independently confirmed live via their own preview URL.
- [ ] Final merged-to-main state re-confirmed live at the production URL, not assumed from the last preview URL alone.
