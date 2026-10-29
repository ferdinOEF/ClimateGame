# Section 38: the last result card with the feedback on it. FINAL REPORT

Branch `section-38-last-card` from master `49333a1`; safety copy `backup/pre-section-38` on GitHub (same point).
**Not merged**: merge with `git merge --no-ff` on the owner's word, never the PR button. PR for review:
https://github.com/ferdinOEF/ClimateGame/pull/36 (head `5f445d0`, Vercel preview Ready, Codex's one finding fixed).

## The commits (one per step; 38.6 in several)

| Commit | Step |
|---|---|
| `384fa9e` | 38.1 card 2 behind a link |
| `02c6a19` | 38.2 the last result card |
| `9398278` | 38.3 the nudge |
| `39e8009` | 38.4 feedback table and export |
| `b6fb351` | 38.4b test tags |
| `e1594ab` | 38.5 docs |
| `ded39a9` to `5f445d0` | 38.6 QA, sixteen commits: the reviewer's fixes, the Help fit, the cards' fade, the shot tool, the screenshots, the QA record, Codex's P2 on the PR |

## What changed

- **38.1** After the 2030 and 2040 storms: card 1, then the outlook card. Card 2 ("What protected your homes") opens
  from a text link on card 1 under the homes saved bar; its only button is Back. Card 1's main button is the
  outlook's old label ("Next: the flood in 2040"); the retry button stays. The Tutorial's cards are unchanged.
- **38.2** After the 2050 storm, one wide card (about 1100 x 680 at 1366x768): left, the storm's headline, stars,
  "41 of 53 homes saved; 12 lost." with the link to card 2, the bar, "Points this storm"; then "Panjim, 2026 to 2050"
  with the total, four rows (three storms and "Nature at the end of 2050: +9 biodiversity, 2 veterans" as one
  number, adding up to the total), "6 of 9 stars" with the chip, and the board box. Right, lighter: "Your feedback",
  the name field only for a run without one, four questions with five 28 px star buttons, "One thing you'll
  remember", the age group (one box at a time), Submit feedback becoming "Thank you." in place (with "You're 4th on
  the board." for a name added there). Footer: View map (the finished board, "Back to your result" bottom centre,
  answers kept), Restart (Play again), Exit. The board post happens as the card opens. Esc does nothing. The
  separate "Your feedback" screen and the old finale card are gone.
- **38.3** The nudge, once per run: View map, Restart or Exit without a Submit shows "Before you go, five taps?"
  over the dimmed card, with "Answer now" and "{Action} anyway". Never after a Submit, never twice, never in the
  Tutorial. Leaving without a Submit posts the empty form with the nudge's outcome and the card's seconds.
- **38.4** `feedback` columns: q1 to q4 (1 to 5), remember (140), age_group (u17, 18_30, 31_plus), nudge (none,
  shown_answered, shown_left), card_seconds, created_at; s1 to s7 dropped by idempotent ALTERs. `POST /api/feedback`
  refuses a bad value, ignores an unknown key, takes an empty form. The export has the new columns, joined to the
  run as before. No name anywhere.
- **38.4b** `?tag=FestTesters` (2 to 30 letters, digits or underscores; memory only) goes with every run, board and
  feedback post; a chip on the name card ("Test session: FestTesters. Not on the board."). `tag` on runs, board and
  feedback; a tagged board post is stored with its tag and gets no rank ("Test session: not on the board."); the
  top 10, every rank and the one row per name rule read untagged rows only. `DEFAULT_TAG` tags posts that send
  none. `npm run tag -- list`; a `tag` column in the export.
- **38.5** Help: the storms paragraph names the link and the last card. PROGRESS, ARCHITECTURE, NEXT_STEPS, DEPLOY.

## Screenshots (`docs/qa/section38/`)

`1-last-card-1366x768.jpg`, `1-last-card-1920x1080.jpg`, `2-card-2-from-last-1366x768.jpg`,
`3-submitted-1366x768.jpg` (four stars, a name, "Thank you. You're 2nd on the board."), `4-view-map-1366x768.jpg`,
`5-nudge-1366x768.jpg`, `6-card-1-2030-1366x768.jpg` (the link under the bar, "Next: the flood in 2040"),
`7-name-card-tagged-1366x768.jpg`. The help shots are not committed (the tool overwrites `docs/qa/section21`,
restored after).

## The migration to run (once, after the merge)

```bash
vercel env pull .env.local
```

```bash
npm run db:migrate
```

It adds q1 to q4, remember, age_group, nudge, card_seconds and `tag` (on runs, board and feedback) and drops s1 to
s7; every statement is idempotent, and the functions apply it on their first request too. Also set
`DEFAULT_TAG=Preview` on Vercel's **Preview** environment only (Preview and Production share the one database; until
it is set, a run on a preview deployment writes real rows, and the preview's first API request applies the ALTERs to
the shared feedback table).

## Numbers

- `tsc --noEmit`, `npm run build` clean; the API bundle rebuilt and current.
- Tests: 111 files, **936 pass**, 6 skipped (was 923). New: `section38`, `lastCard`, `testTag`; server tests for the
  feedback shape and the tags.
- Browser pass at 1366x768: 36 of 36; the card at 1920x1080: 7 of 7; zero console errors. Help fits at 1280x600,
  1366x768, 1920x1080 and 2560x1440.
- Independent reviewer: 0 BLOCKER, 1 MAJOR (the older QA tools still looked for the old finale), 4 MINOR; all
  fixed. Codex on the PR: 1 P2 (the form could post before a refused named run's report landed); fixed.

## For the owner

- **The 2050 storm has no "Try again from 2046" any more**: the last card's footer is View map, Restart, Exit, as
  the brief draws it. Say if the retry should come back as a fourth button.
- The card is 1100 x 679 at 1366x768 (the brief said about 660); nothing clips or scrolls at either size.
- A named run whose board post failed at the card's opening cannot be re-posted from the card (no name field for a
  named run); its box says where it would be.
- The shots found that a card re-rendered in place (card 2 from its link) starts its fade on the next compositor
  frame, which software GL here gave about 3 s late; on a GPU it is 16 ms. The fade uses the Web Animations API now
  and the shot tool waits for it. Not a bug on hardware.

## Could not do

Safari and Firefox; a production load (nothing merged); the migration against Neon (checked twice on pg-mem against
a table of the old shape); the owner's Design canvas was not seen (the brief's words and numbers were used).
`tools/section35Shots.ts` and `tools/section37RenameShot.ts` drive the old form and rename and no longer run.
