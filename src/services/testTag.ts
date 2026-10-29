/**
 * Section 38.4b: test tags. The festival is live with real players on production, so test play must never touch the
 * board. A tag in the address (`?tag=FestTesters`: 2 to 30 letters, digits or underscores; anything else ignored) is
 * kept in memory for this page load only, never in storage, and sent with every run, board and feedback post as
 * `tag`; a tagged row is stored but never shown on the board or counted in a rank. The server can set a default of
 * its own (`DEFAULT_TAG`, for Vercel Preview); the address wins.
 */
export const TAG_PATTERN = /^[A-Za-z0-9_]{2,30}$/;

/** The tag in a query string, or null. */
export function tagFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get("tag");
  return raw !== null && TAG_PATTERN.test(raw) ? raw : null;
}

/** The chip under the name card's title. */
export function tagChipText(tag: string): string {
  return `Test session: ${tag}. Not on the board.`;
}

const current: string | null = typeof window !== "undefined" && typeof window.location?.search === "string" ? tagFromSearch(window.location.search) : null;

/** This page load's tag, or null for a real player. */
export function testTag(): string | null {
  return current;
}
