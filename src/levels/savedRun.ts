/**
 * Where a Panjim run is saved on this device, and the year it was saved in.
 * One place, so the level select (Section 12: "In progress · 2031") and the
 * run itself (app/panjimController.ts) read and write the same key.
 */
export function panjimSaveKey(levelId: string): string {
  return `riptide-rising:panjim2050:v3:${levelId}`;
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
    const saved = JSON.parse(raw) as { snapshot?: { version?: number; turn?: number } };
    const turn = saved.snapshot?.turn;
    if (saved.snapshot?.version !== 3 || typeof turn !== "number" || turn >= totalYears) return null;
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
