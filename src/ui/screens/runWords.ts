import { LEVEL_BY_ID } from "@levels/levels";

/**
 * Panaji's run in words, from its own level data (CLAUDE.md: run length is
 * never hard-coded): "Twenty-five years of Panjim. Three storms. One build a
 * year." for the menu, and the Tutorial's last card.
 */
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberWord(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const PANAJI_LEVEL_ID = "l01-first-rains";

/** Panaji's builds (one a year) and storms, from levels.json. */
export function panajiRun(): { years: number; storms: number } {
  const level = LEVEL_BY_ID.get(PANAJI_LEVEL_ID);
  const timeline = level?.timeline;
  return { years: timeline ? timeline.endYear - timeline.startYear + 1 : 0, storms: level?.climate?.challenges.length ?? 0 };
}

/** The menu's line under the title (Section 15). */
export function menuTagline(): string {
  const { years, storms } = panajiRun();
  return `${capital(numberWord(years))} years of Panjim. ${capital(numberWord(storms))} ${storms === 1 ? "storm" : "storms"}. One build a year.`;
}

/** "twenty-five builds and three storms". */
export function panajiRunPhrase(): string {
  const { years, storms } = panajiRun();
  return `${numberWord(years)} builds and ${numberWord(storms)} ${storms === 1 ? "storm" : "storms"}`;
}
