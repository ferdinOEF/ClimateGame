import { ensureSignedIn, validateEmail } from "./auth";
import { getFirebase, isCloudConfigured } from "./firebase";

/**
 * Who is playing: the email address collected before the first level.
 *
 * This is separate from `profileStore.ts` (which owns stars and scores) and
 * from `auth.ts` (which owns the Firebase credential) because it answers a
 * different question. Progress is about how the game went. Auth is about
 * whether this browser can get back to a save. This is about who sat down —
 * the record a playtest or a classroom session needs in order to mean
 * anything afterwards.
 *
 * ONE FIELD, NOT THREE
 *
 * This gate used to ask for a name and an age as well. Both are gone, because
 * neither was load-bearing and both cost something:
 *
 *   - The **name** was only ever used to seed the leaderboard's display name,
 *     which `settingsScreen.ts` already lets a player set and change. Asking
 *     for it here made the gate three times longer in order to prefill a field
 *     that lives somewhere else. Until a player chooses a name the leaderboard
 *     calls them by the default in `auth.ts` — which is what it did anyway for
 *     everyone who reached the board without passing this gate.
 *   - The **age** was personal data about, frequently, a child, collected for
 *     no purpose the game ever acted on. The safest way to hold data like that
 *     is not to have it.
 *
 * Nothing derives a display name from the address. That would put part of
 * someone's email on a public board, which is a worse disclosure than the
 * default name it would be replacing.
 *
 * WHAT THIS IS NOT
 *
 * It is not authentication. A player types an address into a form; nothing
 * sends a confirmation link, and nothing here can tell a real address from an
 * invented one. Treating these as verified identities would be wrong, and the
 * field name `declaredEmail` is deliberate so no later caller can mistake it
 * for `auth.token.email` — that one IS verified, and lives in `auth.ts`.
 *
 * WHERE IT GOES
 *
 * localStorage first and always, so the gate never blocks a player whose
 * network is down or whose build has no Firebase project at all. Then, if a
 * project is configured, one document at `playtesters/{uid}`. That collection
 * is flat and keyed by uid specifically so the whole sign-up list reads as one
 * page in the Firebase console, which is the actual reason anyone wants this
 * data in the cloud.
 *
 * ON STORING AN EMAIL ADDRESS
 *
 * It is still personal data. So: the rules in `firestore.rules` make the
 * document readable only by its own owner, nothing is written to any public
 * collection (the leaderboard takes the display name and nothing else),
 * `clearRegistration` below is a real local erase, and the form itself says
 * what is kept and why. If this is ever used with a class of children, that
 * consent conversation happens with their school, not in a dialog box.
 */

// Deliberately still the old product name. This key is in the localStorage of
// everyone who has already played, so renaming it alongside the game would
// silently discard every existing registration and send those players back
// through the gate. The string is an opaque identifier, not a label anyone
// reads.
const STORAGE_KEY = "root-and-ruin:player:v1";

/**
 * Bumped from 1 when `name` and `age` were dropped.
 *
 * Both the local reader and `restoreFromCloud` ignore those two old fields
 * rather than rejecting records that still carry them, so a player who
 * registered under v1 keeps their registration instead of being sent back
 * through the form.
 */
export const REGISTRY_SCHEMA_VERSION = 2;

export interface PlayerRegistration {
  /**
   * Self-declared, never confirmed. See this module's header: `auth.ts` owns
   * the verified address, and the two must not be confused.
   */
  declaredEmail: string;
  /** ISO 8601, set once when the player first registers. */
  registeredAt: string;
  schemaVersion: number;
}

export interface FieldErrors {
  email?: string;
}

// ---- validation -------------------------------------------------------

/**
 * Validates the one field there is.
 *
 * Still returns a `FieldErrors` map rather than `string | null`, because the
 * form, the tests and `hasErrors` are all written against that shape and a
 * second field (a class code, say) is a likely enough future that flattening
 * it now would only have to be undone.
 */
export function validateRegistration(input: { email: string }): FieldErrors {
  const errors: FieldErrors = {};
  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

// ---- local store ------------------------------------------------------

let cached: PlayerRegistration | null | undefined;

/**
 * The registration on this device, or null if nobody has registered yet.
 *
 * Tolerates anything in storage. A hand-edited or half-written blob reads as
 * "not registered", which sends the player back through a ten-second form —
 * strictly better than a parse error on boot, which is the only other thing
 * that can happen here.
 */
export function getRegistration(): PlayerRegistration | null {
  if (cached !== undefined) return cached;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cached = null;
      return cached;
    }
    const parsed = JSON.parse(raw) as Partial<PlayerRegistration>;
    const declaredEmail = typeof parsed.declaredEmail === "string" ? parsed.declaredEmail.trim() : "";

    // Re-validate on read rather than trusting what was written. The rules
    // have been tightened more than once and may be again; a record that no
    // longer satisfies them should be re-collected, not quietly honoured.
    if (declaredEmail.length === 0) {
      cached = null;
      return cached;
    }

    cached = {
      declaredEmail,
      registeredAt: typeof parsed.registeredAt === "string" ? parsed.registeredAt : new Date().toISOString(),
      schemaVersion: REGISTRY_SCHEMA_VERSION
    };
    return cached;
  } catch (error) {
    console.warn("[player] registration unreadable; asking again", error);
    cached = null;
    return cached;
  }
}

export function isRegistered(): boolean {
  return getRegistration() !== null;
}

/**
 * Stores a registration locally and starts the cloud mirror.
 *
 * Returns synchronously once the local write is done, because that is what
 * the gate waits on — a player should be on the board the instant they press
 * the button, whatever the network is doing. The upload is fire-and-forget
 * and logs its own failure.
 */
export function saveRegistration(input: { declaredEmail: string }): PlayerRegistration {
  const existing = getRegistration();

  const registration: PlayerRegistration = {
    declaredEmail: input.declaredEmail.trim(),
    // Keep the original timestamp across an edit: this records when the
    // player joined, not when they last corrected a typo.
    registeredAt: existing?.registeredAt ?? new Date().toISOString(),
    schemaVersion: REGISTRY_SCHEMA_VERSION
  };

  cached = registration;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registration));
  } catch (error) {
    // Private browsing, or storage disabled. The session keeps working from
    // the in-memory cache; only surviving a reload is lost.
    console.warn("[player] could not save registration locally", error);
  }

  // No `setStoredDisplayName` call here any more. The leaderboard name is
  // owned by `auth.ts` and edited in Settings; seeding it from the address
  // would publish part of the address.

  void mirrorToCloud(registration);
  return registration;
}

/** Forgets the registration on this device. Does not touch the cloud copy — see `deleteCloudRegistration`. */
export function clearRegistration(): void {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[player] could not clear registration", error);
  }
}

// ---- cloud mirror -----------------------------------------------------

export type MirrorResult =
  | { status: "written" }
  | { status: "offline" }
  /**
   * The rules refused the write. `rateLimited` is a best guess, not a
   * certainty: Firestore reports every rules failure as the same
   * `permission-denied`, with no indication of which condition failed. What
   * makes the guess worth making is that there is exactly one rule here a
   * legitimate player can trip — the five-second floor on rewrites — and the
   * two readings call for completely different actions. "Wait five seconds"
   * and "your rules are wrong" should not share a message.
   */
  | { status: "failed"; reason: string; rateLimited: boolean };

/** How long the rules make a caller wait between rewrites. Mirrors `notTooSoon()` in firestore.rules. */
const REWRITE_COOLDOWN_MS = 5000;

/** When the last successful mirror landed, so a rejection soon after one can be read as the cooldown. */
let lastMirrorAt = 0;

/**
 * Writes the registration to `playtesters/{uid}`.
 *
 * Needs a uid, so it signs in anonymously first if nothing is signed in. That
 * is the same anonymous session the leaderboard already uses, not a new
 * account — a player who later creates a real account keeps this document,
 * because `signUpWithEmail` links the credential to the existing uid rather
 * than minting a fresh one.
 */
export async function mirrorToCloud(registration: PlayerRegistration): Promise<MirrorResult> {
  if (!isCloudConfigured()) return { status: "offline" };

  try {
    const user = await ensureSignedIn();
    const services = await getFirebase();
    if (!user || !services) return { status: "offline" };

    const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
    await setDoc(
      doc(services.db, "playtesters", user.uid),
      {
        declaredEmail: registration.declaredEmail,
        registeredAt: registration.registeredAt,
        schemaVersion: registration.schemaVersion,
        // The rules require the server's own clock here, so a client cannot
        // backdate a write past the rate limit.
        updatedAt: serverTimestamp()
      },
      /*
       * A full overwrite, NOT `{ merge: true }`.
       *
       * The rules use `hasOnly` to list the fields a playtester document may
       * carry, and `name` and `age` are no longer on that list. A merge would
       * leave those two fields in place on any document written under v1, so
       * the first rewrite by a returning player would be rejected and their
       * old age would sit in Firestore indefinitely. Replacing the document
       * is what actually retires the dropped fields.
       */
      { merge: false }
    );
    lastMirrorAt = Date.now();
    return { status: "written" };
  } catch (error) {
    // Never rethrown: a failed mirror must not stop anyone playing.
    const reason = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: unknown } | null)?.code;
    const rateLimited = code === "permission-denied" && Date.now() - lastMirrorAt < REWRITE_COOLDOWN_MS;
    console.warn("[player] could not mirror registration to the cloud", error);
    return { status: "failed", reason, rateLimited };
  }
}

/**
 * Pulls the registration stored against the signed-in account, if this device
 * has none. Called after a sign-in, so an account used on a second browser
 * does not have to fill the form again.
 */
export async function restoreFromCloud(): Promise<PlayerRegistration | null> {
  if (!isCloudConfigured()) return null;
  if (isRegistered()) return getRegistration();

  try {
    const user = await ensureSignedIn();
    const services = await getFirebase();
    if (!user || !services) return null;

    const { doc, getDoc } = await import("firebase/firestore");
    const snapshot = await getDoc(doc(services.db, "playtesters", user.uid));
    if (!snapshot.exists()) return null;

    const data = snapshot.data() as Record<string, unknown>;
    // Reads only the field that still exists. A v1 document carrying a name
    // and an age restores cleanly and loses both, which is the intended
    // direction of travel.
    const declaredEmail = typeof data.declaredEmail === "string" ? data.declaredEmail : "";
    if (!declaredEmail) return null;

    return saveRegistration({ declaredEmail });
  } catch (error) {
    console.warn("[player] could not restore registration from the cloud", error);
    return null;
  }
}

/** Deletes the cloud copy. The account-erasure path; the local copy goes through `clearRegistration`. */
export async function deleteCloudRegistration(): Promise<void> {
  if (!isCloudConfigured()) return;
  try {
    const user = await ensureSignedIn();
    const services = await getFirebase();
    if (!user || !services) return;
    const { deleteDoc, doc } = await import("firebase/firestore");
    await deleteDoc(doc(services.db, "playtesters", user.uid));
  } catch (error) {
    console.warn("[player] could not delete the cloud registration", error);
  }
}
