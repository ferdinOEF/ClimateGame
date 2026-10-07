# Khazan — Step Prompt: Code Review & Cleanup Pass

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or `PROGRESS.md` — read the tail of the last two first, they're current. This is a hygiene/consolidation pass, not a feature or a fix. Drafted after connecting to the live repo directly (`git status`, `git diff --stat`, `tsc --noEmit`, and a manual read of several files) rather than guessing — the findings below are real, not generic advice. **Do not touch game mechanics, balance numbers, or hazard math in this pass** — that's `STEP_PROMPT_balance_tuning.md`'s job, not this one's.

---

## 0. Why now, and what this explicitly is NOT

Fifteen-plus STEP_PROMPT passes have landed on this codebase in sequence (map reshape, icon redesign, hazard science, small dam reservoir, manual-only mode, and more). Nothing here suggests the code is broken — quite the opposite, confirmed directly before writing this prompt:

- `tsc --noEmit` — clean, zero errors.
- Per `NEXT_STEPS.md`'s own last entries: 58/58 tests passing + 6 `skipIf`-gated, production build succeeds.
- No `TODO`/`FIXME`/`HACK`/`XXX` markers anywhere in `src/` or `tests/`.
- No stray `console.log` left in `src/`.

So this is **not** "go fix what's broken." It's: after this many incremental passes, do a deliberate pass to catch the small things that accumulate — stale comments, orphaned plumbing, an honest gap or two that got flagged but not closed, repo housekeeping. Treat every finding below as something to verify and act on, not something to take on faith — some of it may already be fine.

---

## 1. Fix first, in isolation: line-ending drift is polluting every diff

**Confirmed, not suspected.** `git diff --stat` on the current working tree shows this:

```
15 files changed, 6597 insertions(+), 6597 deletions(-)
```

Insertions exactly equal deletions, across every one of those 15 files (`hazard.ts`, `gameState.ts`, `main.ts`, `elements.json`, `map.json`, both large `.md` logs, several more). That's the signature of a line-ending flip, not real edits — confirmed directly: `file src/main.ts` reports **CRLF** line terminators on disk, while the committed index has **LF**. There's no `.gitattributes` in the repo and `core.autocrlf` is unset, so whichever editor or OS touched these files last (likely on a Windows checkout, possibly via OneDrive sync) silently flipped every line ending.

**Fix, as its own isolated commit before anything else in this pass:**
1. Add a `.gitattributes` file at repo root: `* text=auto eol=lf` (matches this project's existing LF-committed files).
2. Renormalize: `git add --renormalize .` then commit.
3. Confirm `git diff --stat HEAD~1` on that commit shows real line counts (thousands of lines), not the exact-match insertions/deletions signature above — that's expected and fine for a renormalization commit, just don't let it get mixed into a commit with real content changes.

Do this **before** any of the sections below — otherwise every subsequent diff in this pass will be unreviewable noise mixed with real changes.

---

## 2. Dead/orphaned code audit

Three constants in `gameState.ts` — `FOOD_DEFICIT_TRUST_FACTOR`, `FOOD_DEFICIT_RESILIENCE_FACTOR`, `FLOOD_BUFFER_RECOVERY_RATE` — have no remaining call site since Manual-Only Mode. They're already kept in place with an explanatory comment per this project's own stated **"don't delete useful plumbing"** convention (see `PROGRESS.md`'s Manual-Only Mode entry). **Do not delete these.** Just confirm the comments above them are still accurate and still point at the right STEP_PROMPT docs — a quick freshness check, not a rewrite.

Beyond those three (already accounted for), do a fresh sweep for anything **not** already flagged:
- Any other now-unreachable branch or helper left behind by Manual-Only Mode specifically (the `skipEraCheck` removal, `checkEraEnd()` → `resetBoard()` rename) — check `render/` and `ui/` as well as `core/`, not just the files that were the direct subject of that pass.
- Any leftover references (comments, variable names, or dead imports) to mechanics that no longer exist — e.g. anything still implying automatic era-end or turn-based income/decay outside of the explicitly-inert constants above.
- Confirm there's no commented-out code block anywhere (a different smell than the explicitly-documented-inert constants, which are fine) — a quick `grep -rn` for suspiciously large `//`-prefixed runs is enough.

---

## 3. Test-suite audit — not "make tests pass," they already do

The goal here is confirming every test still asserts something that matches *current* mechanics and current framing, not chasing failures.

- `tests/era.test.ts` and `tests/cyclone.test.ts` predate Manual-Only Mode. They test `GameState`'s own `isEraOver`/`startNewEra()` directly (still real, still correct — Manual-Only Mode removed *automatic* triggering, not these underlying methods), so they're very likely still valid as-is. Read them with fresh eyes for one thing specifically: stale **comments/describe-block framing** that talks about auto-triggered behavior as if it still happens automatically, since the mechanism they test is now only reached manually via the Reset Board button. Fix comments, not assertions, unless something genuinely doesn't hold.
- Close the one gap `PROGRESS.md` already flagged honestly and left open: the "Remove" button's DOM wiring was verified by code review (same pattern as the proven build-option buttons, same underlying `removeElement()` `__destroyForTest` also calls) but was **never pixel-click-tested with a real screenshot** — the Browser pane wasn't available that session. Do that now: a real click-through with a before/after screenshot, on the actual running build.
- While in the test files, confirm the 6 `skipIf`-gated tests are still intentionally skipped for the same reason they were gated (not silently rotting) — name what each one is gated on.

---

## 4. Repo housekeeping — lower priority, ask before acting on the ambiguous ones

- `tools/screenshots/` has accumulated roughly 50 PNGs across every verification pass since the project started. Some are almost certainly stale (superseded by later map/UI reshapes). Do a pass to identify which are still referenced by any doc or are otherwise still useful as a visual history, versus which are dead weight — but don't mass-delete without a quick tally of what you're removing, since some may be intentionally kept as before/after history.
- `_archive_v1_panjim_digital_twin/` sits at repo root and still shows up in `git status` (one modified file, likely the same CRLF issue from Section 1). Confirm its current purpose — is it meant to stay in this live repo as historical reference, or would it be better moved out entirely? Don't decide this unilaterally; flag what you find and, if it's just CRLF churn like everything else, fold it into the Section 1 renormalization rather than treating it separately.
- Thirteen `STEP_PROMPT_*.md` files plus two large running logs (`PROGRESS.md`, `NEXT_STEPS.md`) live at repo root. Purely organizational — consider whether the completed step prompts want a `docs/step-prompts/` (or similar) subfolder now that there are this many, but this is a preference call, not a defect. If you do move them, update any relative-path references first.
- No linter (ESLint/Prettier) is configured — `package.json` has only `tsc`/`vite`/`vitest`. This repo's `tsconfig.json` also has `noUnusedLocals`/`noUnusedParameters` both `false` (a deliberate choice, per `PROGRESS.md`, to allow the "kept but inert" convention in Section 2 without compiler noise). **Don't add a linter or flip those flags as part of this pass** — that's a bigger decision (would likely reformat every file, burying real changes) — just note it as a question worth raising separately if useful going forward.

---

## 5. Guardrails — explicit, please follow exactly

- **No mechanics or balance changes.** Not a number in `elements.json`, not a decay constant, not an absorption formula. If something looks wrong while you're in there, flag it in `PROGRESS.md` for a future pass — don't fix it inline here.
- **Keep the "kept but inert, commented" convention intact** — this pass tidies and verifies it, it doesn't override it.
- **One concern per commit.** The line-ending fix (Section 1) must be its own commit before any dead-code or test-file edits, so every commit's diff stays reviewable. Don't squash everything into one giant "cleanup" commit.
- **Delete temporary verification scripts after reading their output**, same convention this project already follows (e.g. `tools/verify_manual_only.ts` was deleted after its output was read) — if you write a throwaway script to help audit anything in Section 2–3, don't leave it behind.

---

## Verify

- `tsc --noEmit` clean.
- `npm test` — same pass count as the last recorded baseline (58/58 + 6 `skipIf`-gated), or a documented, justified change if a test was genuinely added/removed/retargeted (not just "made to pass").
- Production build (`npm run build`) succeeds.
- `git log` shows the line-ending fix as its own isolated commit, and `git diff` on every commit after it is legible — real changes only, no CRLF noise.
- `PROGRESS.md` gets the usual entry: what was found in each section, what was changed vs. left alone and why, and the Remove-button screenshot gap explicitly marked closed (or still open, honestly, if the Browser pane still isn't available this session).
