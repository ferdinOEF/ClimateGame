/**
 * Build-time feature switches.
 *
 * Read from Vite's environment so a deployment can turn a feature on or off
 * with an environment variable and a rebuild, not a code change.
 */

/**
 * Whether players are asked for an email address before their first level,
 * and whether the account features (sign in, sign up, Google, "Signed in as")
 * are shown at all.
 *
 * Off by default. With it off the game asks nothing: Play goes straight into
 * the level, nothing on screen mentions email or accounts, and no email is
 * collected, stored or sent. The anonymous Firebase session, progress on the
 * device and the leaderboard keep working as before. Every piece of the
 * email/account flow is still in the codebase, and setting
 * `VITE_REQUIRE_EMAIL=true` at build time brings all of it back.
 *
 * A registration given while it was on is left exactly where it is — in
 * localStorage and in `playtesters/` — and simply not read while it is off.
 */
export const REQUIRE_EMAIL = parseFlag(import.meta.env.VITE_REQUIRE_EMAIL);

/**
 * Whether the main menu shows its extras: the Play/Continue button, Daily
 * Challenge, Leaderboard, the stats tiles and star row, and the footer
 * (settings, sign-in link, where-progress-is-saved note).
 *
 * Off by default. With it off the menu offers two things, "Tutorial" and
 * "Play Panjim", and the leaderboard, daily-challenge and settings screens
 * cannot be reached at all: no button leads to them, and a pasted
 * `#/leaderboard`, `#/settings` or `#/play/daily-...` link lands on the menu.
 * Scores are still saved on the device (and still posted in the background
 * when a Firebase project is configured). Every piece is still in the
 * codebase, and `VITE_SHOW_MENU_EXTRAS=true` at build time brings it back.
 */
export const SHOW_MENU_EXTRAS = parseFlag(import.meta.env.VITE_SHOW_MENU_EXTRAS);

/**
 * Whether the landing page shows the partner credits: the cream "Brought to you by" plate with the OneEarth
 * Foundation and Gokhush Charitable Trust logos (Section 17b, owner decision).
 *
 * Off by default. With it off the menu shows a small "Facts & sources" text link in its bottom corner instead,
 * and the board render's OpenStreetMap credit as always. The plate's code (`creditsStrip` in
 * `src/ui/screens/menuScreen.ts`), its styles and the logo files in `public/branding/` all stay, and
 * `VITE_SHOW_PARTNER_CREDITS=true` at build time brings the plate back.
 */
export const SHOW_PARTNER_CREDITS = parseFlag(import.meta.env.VITE_SHOW_PARTNER_CREDITS);

/**
 * Whether Maya, the guide, appears in the game: her figure and speech bubbles in the Panjim game, the start popup,
 * the Tutorial and the result cards, the "Maya" item in ☰ and the M shortcut.
 *
 * Section 29 (owner decision): ON by default; she is visible again. Section 17c had hidden her. With
 * `VITE_SHOW_MAYA=false` at build time she is hidden as before: never drawn, never speaking, and nothing on screen
 * names her.
 */
export const SHOW_MAYA = flagOr(import.meta.env.VITE_SHOW_MAYA, true);

/** Only the exact string "true" turns a flag on, so a typo or an empty value can never enable it by accident. */
export function parseFlag(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "true";
}

/** A flag with a default: "true" or "false" (any case, trimmed) when set, else `fallback`. */
export function flagOr(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const v = value.trim().toLowerCase();
  return v === "true" ? true : v === "false" ? false : fallback;
}
