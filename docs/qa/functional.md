# Functional QA (Chromium, software GL)

## Routing, refresh, back, sound
- PASS menu offers Tutorial and Choose a level — Tutorial | Choose a level
- PASS no email field on the menu (email requirement hidden)
- PASS Tutorial route renders the board
- PASS browser Back returns to the menu
- PASS no audio context before any click — {"unlocked":false,"context":false,"enabled":true}
- PASS the first click unlocks sound — {"unlocked":true,"context":false,"enabled":true}
- PASS refresh stays on the level — http://localhost:5197/#/play/l01-first-rains

## Resize, hidden tab, fullscreen
- PASS canvas fills the window at 1366x768 — 1366x768
- PASS canvas fills the window at 2560x1440 — 2560x1440
- PASS canvas fills the window at 1920x1080 — 1920x1080
- PASS rendering resumes after the tab is hidden and shown — 20 → 29 frames
- INFO fullscreen: entered and left (headless Chromium may refuse without a real gesture)

## Keyboard only
- PASS R toggles .risk-toggle and back — true → false → true
- PASS M toggles .maya-toggle and back — true → false → true
- PASS S toggles .sound-toggle and back — true → false → true
- PASS Tab reaches the HUD controls — 17 distinct stops
- PASS every focused control shows a visible focus ring — 17 of 17 stops
- PASS focus shows a tooltip and Esc closes it

## axe-core
- PASS axe-core: menu has no serious or critical violations — moderate region ×1 (All page content should be contained by landmarks)
- PASS axe-core: Tutorial has no serious or critical violations — moderate region ×22 (All page content should be contained by landmarks)
- PASS axe-core: Panaji board has no serious or critical violations — moderate region ×11 (All page content should be contained by landmarks)

## Truthfulness: drawn depth = resolved depth

- PASS cyclone: drawn depth equals the core depth on every water tile at t = 6, 9, 12, 16, 20 s — 2930 tile-moments, 1819 wet, worst difference 0
- PASS lightning flashes during the cyclone's height — 1 flashes, storm time 7.0 → 9.6 s
- PASS lightning overlay never brighter than 25% — keyframe peak opacity 0.150
- PASS no more than 3 flashes in any second — at most 1 in a second, 1 in 14.0 s
- PASS flood: drawn depth equals the core depth on every water tile at t = 9, 14, 20, 28 s — 2632 tile-moments, 988 wet, worst difference 0
- PASS finale: drawn depth equals the core depth on every water tile at t = 10, 16, 22, 30 s — 2680 tile-moments, 1602 wet, worst difference 0

## Console errors, warnings and failed requests

- PASS no console errors, warnings or failed requests in any of the runs above

**All checks passed**
