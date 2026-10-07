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

/** Only the exact string "true" turns a flag on, so a typo or an empty value can never enable it by accident. */
export function parseFlag(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "true";
}
