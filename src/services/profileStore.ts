import {
  emptyProgress,
  levelsCompleted,
  mergeProgress,
  PROGRESS_SCHEMA_VERSION,
  recordRun,
  totalScore,
  totalStars,
  type PlayerProgress,
  type ProgressDelta,
  type RunOutcome
} from "@levels/progression";
import { isDailyLevel } from "@levels/levels";
import { ensureSignedIn, getCurrentUser, onAuthChanged, storedDisplayName } from "./auth";
import { getFirebase, isCloudConfigured } from "./firebase";
import { submitGlobalTotals, submitScore } from "./leaderboard";
import { REQUIRE_EMAIL } from "./features";

/**
 * The single source of truth for player progress, in front of two very
 * different backends.
 *
 * localStorage is the PRIMARY store, always written, always read first.
 * Firestore is a mirror layered on top. That ordering is deliberate and it
 * is what makes the offline path real rather than theoretical: the game is
 * fully playable — campaign, unlocks, stars, achievements — with no
 * network, no account, and no Firebase project at all. Cloud sync adds
 * cross-device continuity and the shared board; it is never load-bearing.
 *
 * Writes are local-first and synchronous, cloud-second and fire-and-
 * forget. A player who finishes a level sees their stars immediately; the
 * upload happening (or silently failing on a train) never blocks the UI.
 */

const STORAGE_KEY = "root-and-ruin:progress:v1";

let progress: PlayerProgress = emptyProgress(storedDisplayName());
let loaded = false;
let cloudSyncedUid: string | null = null;

type Listener = (progress: PlayerProgress) => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(progress);
}

export function onProgressChanged(listener: Listener): () => void {
  listeners.add(listener);
  listener(progress);
  return () => listeners.delete(listener);
}

export function getProgress(): PlayerProgress {
  if (!loaded) loadLocal();
  return progress;
}

// ---- local persistence ------------------------------------------------

/**
 * Reads the local save, tolerating anything. A corrupted or hand-edited
 * blob resets to a fresh profile rather than throwing during boot — losing
 * local progress is bad, but a save file that can brick the game on load
 * is worse, and this is the only place that can happen.
 */
function loadLocal(): void {
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      progress = emptyProgress(storedDisplayName());
      return;
    }
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    progress = {
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : storedDisplayName(),
      levels: parsed.levels && typeof parsed.levels === "object" ? parsed.levels : {},
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements.filter((id) => typeof id === "string") : [],
      schemaVersion: PROGRESS_SCHEMA_VERSION
    };
  } catch (error) {
    console.warn("[progress] local save unreadable; starting fresh", error);
    progress = emptyProgress(storedDisplayName());
  }
}

function saveLocal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (error) {
    // Quota exhausted, or storage disabled entirely. The session keeps
    // working from memory; only persistence across a reload is lost.
    console.warn("[progress] could not write local save", error);
  }
}

function setProgress(next: PlayerProgress): void {
  progress = next;
  saveLocal();
  emit();
}

export function setDisplayName(name: string): void {
  setProgress({ ...progress, displayName: name });
  // Push the new name onto the boards the player already appears on, so a
  // rename is reflected rather than leaving a stale name at the top of a
  // board forever.
  void pushGlobalTotals();
}

// ---- cloud sync -------------------------------------------------------

/**
 * Pulls the cloud save (if any) and merges it with local play.
 *
 * Merge is best-of per level (see `mergeProgress`), never last-write-wins.
 * The case that rule exists for is ordinary: someone plays a few levels
 * signed out on their laptop, then signs in with an account that already
 * has progress from their phone. Either half overwriting the other loses
 * real work; taking the better of each cannot.
 */
export async function syncWithCloud(): Promise<void> {
  if (!isCloudConfigured()) return;
  if (!loaded) loadLocal();

  const user = await ensureSignedIn();
  const services = await getFirebase();
  if (!user || !services) return;

  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const snapshot = await getDoc(doc(services.db, "players", user.uid));

    if (snapshot.exists()) {
      const data = snapshot.data() as Record<string, unknown>;
      const remote: PlayerProgress = {
        displayName: String(data.displayName ?? progress.displayName),
        // Per-level detail lives in the `progress` subcollection, fetched
        // below. The player document holds only the aggregate totals the
        // leaderboard needs, so reading it is one document read, not N.
        levels: {},
        achievements: Array.isArray(data.achievements) ? (data.achievements as string[]) : [],
        schemaVersion: PROGRESS_SCHEMA_VERSION
      };

      const { collection, getDocs } = await import("firebase/firestore");
      const levelDocs = await getDocs(collection(services.db, "players", user.uid, "progress"));
      for (const levelDoc of levelDocs.docs) {
        const record = levelDoc.data() as Record<string, unknown>;
        remote.levels[levelDoc.id] = {
          levelId: levelDoc.id,
          bestScore: Number(record.bestScore ?? 0),
          stars: Number(record.stars ?? 0),
          bestTurns: Number(record.bestTurns ?? 0),
          attempts: Number(record.attempts ?? 0),
          completed: Boolean(record.completed)
        };
      }

      setProgress(mergeProgress(progress, remote));
    }

    cloudSyncedUid = user.uid;
    // Push the merged result straight back up, so the account that had
    // less now has everything and the two devices agree from here on.
    await pushFullProgress();
  } catch (error) {
    console.warn("[progress] cloud sync failed; staying local", error);
  }
}

/**
 * The account identity fields mirrored onto the player document.
 *
 * Firebase Auth is the system of record for a player's email — this is a
 * convenience copy so the owner can see their account details beside their
 * save, and so the project owner can answer "who is this uid" from the
 * Firestore console without cross-referencing the Auth tab.
 *
 * A password is never part of this, and never could be: Firebase Auth
 * stores a salted hash and does not expose the original to client code at
 * all. Nothing in this application ever holds a password beyond the moment
 * the sign-in form hands it to the SDK.
 *
 * Omitted entirely for an anonymous session, which genuinely has no email —
 * writing `null` would fail the rules' string check on the field. Also
 * omitted while account features are off (`REQUIRE_EMAIL`), so a session
 * signed in under an earlier build does not keep sending its address.
 */
function accountFields(): { email?: string } {
  if (!REQUIRE_EMAIL) return {};
  const email = getCurrentUser()?.email;
  return email ? { email } : {};
}

/** Writes the aggregate player document plus every level record. Used after a merge; ordinary play uses the single-level `pushLevel` below. */
async function pushFullProgress(): Promise<void> {
  const services = await getFirebase();
  const user = getCurrentUser();
  if (!services || !user) return;

  try {
    const { doc, serverTimestamp, writeBatch } = await import("firebase/firestore");
    const batch = writeBatch(services.db);

    batch.set(doc(services.db, "players", user.uid), {
      ...accountFields(),
      displayName: progress.displayName,
      totalStars: totalStars(progress),
      totalScore: Math.round(totalScore(progress)),
      levelsCompleted: levelsCompleted(progress),
      achievements: progress.achievements.slice(0, 100),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: PROGRESS_SCHEMA_VERSION
    });

    for (const record of Object.values(progress.levels)) {
      // Daily-challenge runs are not campaign progress and have their own
      // board; writing them here would inflate the player's level count.
      if (isDailyLevel(record.levelId)) continue;
      batch.set(doc(services.db, "players", user.uid, "progress", record.levelId), {
        levelId: record.levelId,
        bestScore: Math.round(record.bestScore),
        stars: record.stars,
        bestTurns: record.bestTurns,
        attempts: record.attempts,
        completed: record.completed,
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    await pushGlobalTotals();
  } catch (error) {
    console.warn("[progress] cloud write failed", error);
  }
}

async function pushGlobalTotals(): Promise<void> {
  if (!isCloudConfigured()) return;
  await submitGlobalTotals({
    totalScore: totalScore(progress),
    totalStars: totalStars(progress),
    levelsCompleted: levelsCompleted(progress)
  });
}

/** Writes one level's record. The ordinary post-run path — one document, not the whole profile. */
async function pushLevel(levelId: string): Promise<void> {
  const services = await getFirebase();
  const user = getCurrentUser();
  if (!services || !user || isDailyLevel(levelId)) return;

  const record = progress.levels[levelId];
  if (!record) return;

  try {
    const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
    await setDoc(doc(services.db, "players", user.uid, "progress", levelId), {
      levelId,
      bestScore: Math.round(record.bestScore),
      stars: record.stars,
      bestTurns: record.bestTurns,
      attempts: record.attempts,
      completed: record.completed,
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(services.db, "players", user.uid), {
      ...accountFields(),
      displayName: progress.displayName,
      totalStars: totalStars(progress),
      totalScore: Math.round(totalScore(progress)),
      levelsCompleted: levelsCompleted(progress),
      achievements: progress.achievements.slice(0, 100),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: PROGRESS_SCHEMA_VERSION
    });
  } catch (error) {
    console.warn("[progress] level write failed", error);
  }
}

// ---- the post-run entry point ----------------------------------------

export interface RecordRunResult extends ProgressDelta {
  /** Resolves once the cloud write settles. Awaiting it is optional; the UI does not. */
  cloudWrite: Promise<void>;
}

/**
 * The one call the game makes when a run ends.
 *
 * Order matters: local state is updated and broadcast FIRST, then the
 * cloud write is kicked off without being awaited. The level-complete
 * screen therefore renders from data that is already committed locally,
 * and a slow or failed upload changes nothing the player sees.
 */
export function recordRunResult(outcome: RunOutcome, newAchievements: readonly string[] = []): RecordRunResult {
  if (!loaded) loadLocal();

  const delta = recordRun(progress, outcome);
  const withAchievements: PlayerProgress = {
    ...delta.progress,
    achievements: [...new Set([...delta.progress.achievements, ...newAchievements])]
  };

  setProgress(withAchievements);

  const cloudWrite = (async () => {
    if (!isCloudConfigured()) return;
    if (!getCurrentUser()) await ensureSignedIn();
    if (!getCurrentUser()) return;

    // Only publish a score worth publishing. The rules would reject a
    // non-improving write anyway, but not making the request at all is
    // what actually protects the free tier's daily write budget.
    if (outcome.completed && delta.isNewBestScore) {
      await submitScore({
        levelId: outcome.levelId,
        score: outcome.score,
        stars: outcome.stars,
        turns: outcome.turns
      });
    }
    await pushLevel(outcome.levelId);
  })();

  // Surfacing this as a rejected promise nobody awaits would produce an
  // unhandled rejection in the console on every offline run.
  void cloudWrite.catch(() => {});

  return { ...delta, progress: withAchievements, cloudWrite };
}

/**
 * Starts background sync once, when the app boots. Re-syncs on a real
 * account change (a Google link that lands on a different uid), which is
 * exactly when a merge is needed — but not on the initial anonymous
 * sign-in, which `syncWithCloud` has already handled.
 */
export function startProfileSync(): void {
  if (!loaded) loadLocal();
  void syncWithCloud();

  onAuthChanged((user) => {
    if (user && cloudSyncedUid !== null && user.uid !== cloudSyncedUid) void syncWithCloud();
  });
}

/**
 * Merges newly unlocked achievement ids into the profile.
 *
 * Separate from `recordRunResult` on purpose. Achievements are decided
 * AFTER a run has been recorded — several of them ask questions like "have
 * you now cleared every level", which only the post-run picture can answer
 * — so they arrive a step late. Routing them back through
 * `recordRunResult` would count a second attempt against the level and
 * quietly corrupt the tally the "Persistent" badge reads.
 */
export function unlockAchievements(ids: readonly string[]): void {
  if (ids.length === 0) return;
  if (!loaded) loadLocal();

  const merged = [...new Set([...progress.achievements, ...ids])];
  if (merged.length === progress.achievements.length) return; // nothing actually new

  setProgress({ ...progress, achievements: merged });

  void (async () => {
    if (!isCloudConfigured()) return;
    const user = getCurrentUser();
    const services = await getFirebase();
    if (!user || !services) return;
    try {
      const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
      await setDoc(doc(services.db, "players", user.uid), {
        ...accountFields(),
        displayName: progress.displayName,
        totalStars: totalStars(progress),
        totalScore: Math.round(totalScore(progress)),
        levelsCompleted: levelsCompleted(progress),
        achievements: progress.achievements.slice(0, 100),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: PROGRESS_SCHEMA_VERSION
      });
    } catch (error) {
      console.warn("[progress] achievement write failed", error);
    }
  })();
}

/** Wipes local progress. Used by the "reset progress" control in settings. Does not touch cloud data — that is a separate, explicit action. */
export function resetLocalProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  progress = emptyProgress(storedDisplayName());
  loaded = true;
  emit();
}
