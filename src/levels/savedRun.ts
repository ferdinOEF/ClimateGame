/**
 * Where a Panjim run is saved on this device, and the year it was saved in.
 * One place, so the level select (Section 12: "In progress · 2031") and the
 * run itself (app/panjimController.ts) read and write the same key.
 */
export function panjimSaveKey(levelId: string): string {
  return `riptide-rising:panjim2050:v3:${levelId}`;
}

import { LEVEL_BY_ID } from "./levels";
import { mapById } from "./levelMap";

/**
 * Which board a save was made on (Section 16): a short hash of the level's
 * map, every tile's place and terrain and every monument's place. A save made
 * on another board (before the owner's map edits) is not offered: its
 * defences would stand on ground that has changed.
 */
const fingerprints = new Map<string, string>();
export function boardFingerprint(levelId: string): string {
  const cached = fingerprints.get(levelId);
  if (cached) return cached;
  const level = LEVEL_BY_ID.get(levelId);
  const map = level ? mapById(level.mapId) : null;
  const text = map ? JSON.stringify([map.tiles.map((t) => [t.coord.q, t.coord.r, t.terrainId]), map.monuments.map((m) => [m.id, m.q, m.r])]) : levelId;
  // FNV-1a, 32 bits.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const out = hash.toString(16).padStart(8, "0");
  fingerprints.set(levelId, out);
  return out;
}

/** True when a save is one this build can continue: the yearly clock (v3), on this board. */
export function saveFits(levelId: string, saved: { snapshot?: { version?: number }; board?: string } | null): boolean {
  return !!saved && saved.snapshot?.version === 3 && saved.board === boardFingerprint(levelId);
}

/**
 * The year a saved, unfinished run continues from ("Continue from 2031"), or
 * null when there is none: no save, an unreadable or old one, or a finished
 * run. `startYear` is the level's first year; `totalYears` its length.
 */
export function savedRunYear(levelId: string, startYear: number, totalYears: number, storage: Pick<Storage, "getItem"> | null = safeStorage()): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(panjimSaveKey(levelId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { snapshot?: { version?: number; turn?: number }; board?: string };
    const turn = saved.snapshot?.turn;
    if (!saveFits(levelId, saved) || typeof turn !== "number" || turn >= totalYears) return null;
    return startYear + turn;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
