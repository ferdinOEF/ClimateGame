/**
 * Section 35.4: what this visit has done, in memory only (nothing is saved on the machine, Section 28): whether the
 * Tutorial was played before a Play Panjim run (the runs table's `tutorial_first`).
 */
let tutorialPlayed = false;

export function markTutorialPlayed(): void {
  tutorialPlayed = true;
}

export function tutorialPlayedThisVisit(): boolean {
  return tutorialPlayed;
}
