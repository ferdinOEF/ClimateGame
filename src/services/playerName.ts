/**
 * Section 35.3: the name a player gave for the board, held in memory for this run only. Play again, Start again and
 * "Try again from {year}" keep it; the menu (Exit, Leave, the idle reset) clears it, and a reload loses it. It is never
 * written to the browser's storage or a cookie (Section 28: nothing about a run is saved on the machine).
 */
let current: string | null = null;

export function getPlayerName(): string | null {
  return current;
}

export function setPlayerName(name: string | null): void {
  current = name;
}

export function clearPlayerName(): void {
  current = null;
}
