/**
 * Section 35.3: the name a player gave for the board, held in memory for this run only. Start again and "Try again
 * from {year}" keep it (the same run); the menu (Exit, Leave, the idle reset) clears it, and a reload loses it. It is
 * never written to the browser's storage or a cookie (Section 28: nothing about a run is saved on the machine).
 * Section 37.4: Play again on the finale clears it too, so the next run's name card opens with an empty field (the
 * next player at a festival laptop is often someone else).
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

/** Section 37.4: Play again on the finale: a new run, so its name card opens empty. */
export function playAgain(): void {
  current = null;
}
