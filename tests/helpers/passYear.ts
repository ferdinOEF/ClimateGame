import type { ActionRun, RunEvent } from "../../src/core/actionRun";

/**
 * Tests only: ends the year without a build. In the game a year ends only
 * when the player builds (Section 8); tests that need a board with nothing
 * built at a later year (the undefended storm, the heat's first year) move
 * the clock with this instead.
 */
export function passYear(run: ActionRun): RunEvent[] {
  return (run as unknown as { endYear(): RunEvent[] }).endYear();
}
