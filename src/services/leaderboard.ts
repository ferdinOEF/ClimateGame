import { getFirebase } from "./firebase";
import { getCurrentUser } from "./auth";
import { isDailyLevel } from "@levels/levels";

/**
 * The shared scoreboard.
 *
 * Shape: one document per player per board, keyed by uid, never an
 * append-only log of runs. That single decision is what makes a global
 * leaderboard viable on the Spark plan — see the matching comment in
 * firestore.rules for the quota arithmetic behind it. It also means the
 * board never needs pruning: it is bounded by player count, not by how
 * much anyone plays.
 *
 * Every read here is a bounded `limit()` query. An unbounded collection
 * read would bill one document read per row returned, which on a free tier
 * is exactly how a popular day takes the game offline until midnight.
 */

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  score: number;
  stars: number;
  turns: number;
  /** 1-based position in the returned page, filled in on read. */
  rank: number;
  /** True for the signed-in player's own row, so the UI can highlight it. */
  isSelf: boolean;
}

export interface GlobalLeaderboardEntry {
  uid: string;
  displayName: string;
  totalScore: number;
  totalStars: number;
  levelsCompleted: number;
  rank: number;
  isSelf: boolean;
}

/** How many rows a board shows. Kept small deliberately: it is a page of document reads every time someone opens the screen. */
export const BOARD_PAGE_SIZE = 25;

export interface ScoreSubmission {
  levelId: string;
  score: number;
  stars: number;
  turns: number;
}

export type SubmitResult =
  | { status: "submitted" }
  /** The rules rejected the write because the existing row is already better. Not an error — the common case on a replay. */
  | { status: "not-a-personal-best" }
  | { status: "offline" }
  | { status: "error"; message: string };

/**
 * Publishes a score to the board for its level (or to the daily board,
 * for a daily challenge run).
 *
 * `setDoc` with `merge: false` writes the whole row; firestore.rules then
 * decides whether it is allowed — specifically, an update only passes if
 * the new score genuinely beats the stored one. That check lives in the
 * rules rather than here on purpose: a client-side "is this a personal
 * best" test is a courtesy, not a control, since the client is exactly
 * what an attacker replaces.
 *
 * A rejected write therefore surfaces as `permission-denied`, which for
 * this collection almost always means "you did not beat your old score".
 * Reporting that as an error would put a scary message on a perfectly
 * normal replay, so it is reported as its own non-error outcome.
 */
export async function submitScore(submission: ScoreSubmission): Promise<SubmitResult> {
  const services = await getFirebase();
  const user = getCurrentUser();
  if (!services || !user) return { status: "offline" };

  try {
    const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");

    const path = isDailyLevel(submission.levelId)
      ? ["daily", submission.levelId.slice("daily-".length), "entries", user.uid]
      : ["leaderboards", submission.levelId, "entries", user.uid];

    const payload = isDailyLevel(submission.levelId)
      ? {
          uid: user.uid,
          displayName: user.displayName,
          score: Math.round(submission.score),
          stars: submission.stars,
          turns: submission.turns,
          dateId: submission.levelId.slice("daily-".length),
          updatedAt: serverTimestamp()
        }
      : {
          uid: user.uid,
          displayName: user.displayName,
          score: Math.round(submission.score),
          stars: submission.stars,
          turns: submission.turns,
          levelId: submission.levelId,
          updatedAt: serverTimestamp()
        };

    await setDoc(doc(services.db, path[0], path[1], path[2], path[3]), payload);
    return { status: "submitted" };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "permission-denied") return { status: "not-a-personal-best" };
    if (code === "unavailable") return { status: "offline" };
    console.warn("[leaderboard] score submission failed", error);
    return { status: "error", message: "Couldn't reach the leaderboard. Your score is saved on this device." };
  }
}

/** Mirrors the player's campaign totals onto the all-levels board. Separate from `submitScore` because it is driven by aggregate progress, not by one run. */
export async function submitGlobalTotals(totals: {
  totalScore: number;
  totalStars: number;
  levelsCompleted: number;
}): Promise<SubmitResult> {
  const services = await getFirebase();
  const user = getCurrentUser();
  if (!services || !user) return { status: "offline" };

  try {
    const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
    await setDoc(doc(services.db, "globalEntries", user.uid), {
      uid: user.uid,
      displayName: user.displayName,
      totalScore: Math.round(totals.totalScore),
      totalStars: totals.totalStars,
      levelsCompleted: totals.levelsCompleted,
      updatedAt: serverTimestamp()
    });
    return { status: "submitted" };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "permission-denied") return { status: "not-a-personal-best" };
    console.warn("[leaderboard] global submission failed", error);
    return { status: "error", message: "Couldn't update the overall board." };
  }
}

/**
 * Top scores for one level. Returns an empty array when offline rather
 * than throwing — the board screen renders an "offline" state from the
 * same empty result it would show for a genuinely empty board, and neither
 * case is worth an exception.
 */
export async function fetchLevelBoard(levelId: string, max = BOARD_PAGE_SIZE): Promise<LeaderboardEntry[]> {
  const services = await getFirebase();
  if (!services) return [];

  try {
    const { collection, getDocs, limit, orderBy, query } = await import("firebase/firestore");

    const path = isDailyLevel(levelId)
      ? collection(services.db, "daily", levelId.slice("daily-".length), "entries")
      : collection(services.db, "leaderboards", levelId, "entries");

    // Ties break by who got there first — the ascending updatedAt secondary
    // sort. Matches the composite index in firestore.indexes.json; without
    // that index this query fails at runtime, not at build time.
    const snapshot = await getDocs(query(path, orderBy("score", "desc"), orderBy("updatedAt", "asc"), limit(max)));

    const selfUid = getCurrentUser()?.uid;
    return snapshot.docs.map((docSnapshot, index) => {
      const data = docSnapshot.data() as Record<string, unknown>;
      return {
        uid: String(data.uid ?? docSnapshot.id),
        displayName: String(data.displayName ?? "Coastkeeper"),
        score: Number(data.score ?? 0),
        stars: Number(data.stars ?? 0),
        turns: Number(data.turns ?? 0),
        rank: index + 1,
        isSelf: docSnapshot.id === selfUid
      };
    });
  } catch (error) {
    console.warn("[leaderboard] level board unavailable", error);
    return [];
  }
}

export async function fetchGlobalBoard(max = BOARD_PAGE_SIZE): Promise<GlobalLeaderboardEntry[]> {
  const services = await getFirebase();
  if (!services) return [];

  try {
    const { collection, getDocs, limit, orderBy, query } = await import("firebase/firestore");
    const snapshot = await getDocs(
      query(collection(services.db, "globalEntries"), orderBy("totalScore", "desc"), orderBy("updatedAt", "asc"), limit(max))
    );

    const selfUid = getCurrentUser()?.uid;
    return snapshot.docs.map((docSnapshot, index) => {
      const data = docSnapshot.data() as Record<string, unknown>;
      return {
        uid: String(data.uid ?? docSnapshot.id),
        displayName: String(data.displayName ?? "Coastkeeper"),
        totalScore: Number(data.totalScore ?? 0),
        totalStars: Number(data.totalStars ?? 0),
        levelsCompleted: Number(data.levelsCompleted ?? 0),
        rank: index + 1,
        isSelf: docSnapshot.id === selfUid
      };
    });
  } catch (error) {
    console.warn("[leaderboard] global board unavailable", error);
    return [];
  }
}
