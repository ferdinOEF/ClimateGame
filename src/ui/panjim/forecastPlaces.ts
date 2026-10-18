import type { ActionRun } from "@core/actionRun";
import type { ScheduledChallenge } from "@core/climate";
import { regionPlaces } from "@core/prep";

/**
 * The places a forecast's map may name, best first (the preview keeps at most three that clear one another,
 * `previewLabels`): a storm's own area's labels (Section 16), else the landmarks within two hexes of the homes
 * it would take.
 */
export function forecastPlaceCandidates(
  run: ActionRun,
  challenge: ScheduledChallenge,
  landmarks: readonly { name: string; q: number; r: number }[],
  localities: readonly { name: string; q: number; r: number }[]
): { name: string; q: number; r: number }[] {
  const own = run.ownAreaFor(challenge.id);
  if (own) {
    const find = (name: string) => landmarks.find((l) => l.name === name) ?? localities.find((l) => l.name === name);
    return (own.region.labels ?? regionPlaces(own.region)).map(find).filter((l): l is { name: string; q: number; r: number } => Boolean(l));
  }
  const zone = new Set(run.exposureFor(challenge)?.housesAtRisk ?? []);
  const near = (l: { q: number; r: number }): boolean => [...zone].some((key) => {
    const [q, r] = key.split(",").map(Number);
    return (Math.abs(q - l.q) + Math.abs(r - l.r) + Math.abs(q + r - l.q - l.r)) / 2 <= 2;
  });
  return landmarks.filter(near);
}
