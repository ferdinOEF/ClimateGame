export type SoundId = "tile_settle" | "build" | "hazard_telegraph" | "hazard_resolve" | "era_end";

/**
 * Placeholder audio hooks (Section 9's Phase 5 milestone: "audio hooks,
 * placeholder SFX fine"). No audio assets exist yet — this just gives every
 * call site in the game a single, real place to route sound through later,
 * rather than needing to thread sound-triggering through the codebase
 * retroactively once assets exist.
 */
export function playSound(id: SoundId): void {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[audio] ${id}`);
  }
}
