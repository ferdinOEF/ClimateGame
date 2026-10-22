/**
 * Section 28.2 (owner decision): nothing about a run or the Tutorial is saved on the machine. The game will be
 * shown at the Emergence festival in Panjim, where many people sit, play and leave one after another: closing or
 * reloading the page always starts fresh at the menu, and Play Panjim always starts at 2026.
 *
 * On load, the keys an older version wrote about progress are cleared once (`clearOldProgress`), so a machine that
 * played an older version starts clean. What the game still keeps on the machine is listed in `KEYS_STILL_USED`:
 * display preferences only, none about progress. Nothing is kept in sessionStorage.
 */

/** Progress an older version saved: removed on every load (removing an absent key costs nothing). */
export const OLD_PROGRESS_KEYS: readonly string[] = [
  // Stars, scores, attempts, levels completed (the Tutorial's "done" included) and achievements.
  "root-and-ruin:progress:v1",
  // The Field Guide's creatures found, and Maya's notes collected.
  "riptide-rising:field-guide:v1",
  "riptide-rising:maya-notes:v1"
];

/** Saved runs ("Continue from <year>"), by level: every clock's version (v1 quarterly, v2, v3 yearly). */
export const OLD_PROGRESS_PREFIXES: readonly string[] = ["riptide-rising:panjim2050:"];

/** Every localStorage key the game still uses, and why. None is about progress. */
export const KEYS_STILL_USED: Readonly<Record<string, string>> = {
  "riptide-rising:sound": "Sound on or off (S), a preference.",
  "riptide-rising:volume": "The volume slider, a preference.",
  "riptide-rising:quality": "Graphics quality (Auto, High, Low), a preference.",
  "riptide-rising:calm-motion": "Calm motion on or off, a preference (defaults to the system's reduced motion).",
  "riptide-rising:maya-voice:v1": "Maya's voice on or off (M); Maya is hidden (SHOW_MAYA off), so it is not written.",
  "riptide-rising:map-layer:v4": "The street map's opacity, a preference (v2 and v3 read once to carry an old choice over).",
  "root-and-ruin:display-name": "The name shown on the leaderboard; written only from Settings, which no button reaches.",
  "root-and-ruin:player:v1": "The sign up sheet (name, age, email); used only with VITE_REQUIRE_EMAIL, off by default."
};

/** Removes every old progress key from `storage`. Returns the keys it removed. Never throws. */
export function clearOldProgress(storage: Pick<Storage, "length" | "key" | "removeItem"> | null = safeStorage()): string[] {
  if (!storage) return [];
  const removed: string[] = [];
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && (OLD_PROGRESS_KEYS.includes(key) || OLD_PROGRESS_PREFIXES.some((prefix) => key.startsWith(prefix)))) {
        storage.removeItem(key);
        removed.push(key);
      }
    }
  } catch {
    // Storage blocked: there is nothing it could hold.
  }
  return removed;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
