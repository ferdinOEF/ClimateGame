import type { User } from "firebase/auth";
import { getFirebase, isCloudConfigured } from "./firebase";

/**
 * Authentication.
 *
 * The default is anonymous sign-in, on purpose. A player should be able to
 * land on the site, play, and appear on the leaderboard without ever being
 * asked to create anything — a sign-up wall in front of a browser game is
 * the single most reliable way to lose the player. Firebase gives the
 * anonymous session a real, stable uid, which is all the leaderboard and
 * the cloud save actually need.
 *
 * Google sign-in exists as an UPGRADE from that anonymous session, via
 * `linkWithPopup` rather than a fresh sign-in. That distinction matters:
 * linking keeps the same uid, so the progress the player already earned
 * anonymously carries over intact. Signing in fresh would hand them a new
 * uid and silently orphan everything they had done. (When the Google
 * account is already linked to a different uid — they played on another
 * device — linking fails with `credential-already-in-use`; we then sign in
 * to that existing account and let profileStore's best-of merge reconcile
 * the two histories.)
 */

export interface AuthUser {
  uid: string;
  displayName: string;
  isAnonymous: boolean;
  /** True once a real provider (email or Google) is attached to this uid. */
  hasProvider: boolean;
  /**
   * The account's email, when there is one. Anonymous sessions have none.
   *
   * Read back from Firebase Auth, which is the system of record for it —
   * never from a copy this app keeps. The mirror written to Firestore
   * (see profileStore) exists so the owner can see their own account
   * details next to their save; it is not what anything authenticates
   * against.
   */
  email: string | null;
}

type Listener = (user: AuthUser | null) => void;

const listeners = new Set<Listener>();
let currentUser: AuthUser | null = null;
let watching = false;

const NAME_KEY = "root-and-ruin:display-name";
const DEFAULT_NAME = "Coastkeeper";

/**
 * Display names are shown to every other player on a public board, and on
 * Spark there is no Cloud Function to moderate them after the fact. So the
 * client narrows what can be submitted: printable characters only, no
 * newlines or control codes (which would break the board's layout), length
 * capped to match the 24-character ceiling firestore.rules enforces.
 * The rules are the real boundary; this is what keeps honest input tidy.
 */
/**
 * The character cleanup, without the default-name fallback.
 *
 * Split out from `sanitiseName` because two callers need the same cleaning
 * and opposite answers for blank input. A leaderboard row must always carry
 * SOME name, so `sanitiseName` substitutes one. A form field that asks for a
 * name must be able to tell that the player left it blank — and if it asks
 * `sanitiseName` it never can, because "" comes back as the default name and
 * validates clean. Keeping the regexes in one place is what stops the two
 * definitions of "a tidy name" drifting apart.
 */
export function normaliseName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

export function sanitiseName(raw: string): string {
  const cleaned = normaliseName(raw);
  return cleaned.length > 0 ? cleaned : DEFAULT_NAME;
}

export function storedDisplayName(): string {
  try {
    return sanitiseName(localStorage.getItem(NAME_KEY) ?? DEFAULT_NAME);
  } catch {
    // Private-browsing modes can throw on localStorage access rather than
    // returning null. A missing name is never worth failing a boot over.
    return DEFAULT_NAME;
  }
}

export function setStoredDisplayName(name: string): string {
  const clean = sanitiseName(name);
  try {
    localStorage.setItem(NAME_KEY, clean);
  } catch {
    /* non-fatal: the name simply will not survive a reload */
  }
  if (currentUser) {
    currentUser = { ...currentUser, displayName: clean };
    emit();
  }
  return clean;
}

/**
 * Credential validation.
 *
 * A note on what this is and is not for. Firebase Auth is the actual
 * authority — it rejects a malformed email and enforces its own six-
 * character password floor server-side, and no amount of client checking
 * changes that. These functions exist so a player finds out what is wrong
 * *before* a network round trip, in language that tells them how to fix it,
 * rather than reading `auth/weak-password` out of a toast.
 *
 * Pure, so `tests/auth.test.ts` can cover the rules without a browser or a
 * Firebase project.
 */

/** Minimum we ask for. Above Firebase's own floor of 6 — the extra two characters cost a player nothing and materially raise the bar on a guessing attack. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Deliberately permissive. Email syntax is famously more varied than most
 * regexes assume, and every address this rejects is a real person locked
 * out of their own account. It catches the genuine typos — no @, nothing
 * before or after it, no dot in the domain, stray whitespace — and lets
 * the delivery attempt be the real test.
 */
export function validateEmail(raw: string): string | null {
  const email = raw.trim();
  if (email.length === 0) return "Enter your email address.";
  if (email.length > 254) return "That email address is too long.";
  if (/\s/.test(email)) return "Email addresses can't contain spaces.";
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return "That doesn't look like an email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length === 0) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  // Firebase caps at 4096 bytes; failing here beats a confusing server error.
  if (password.length > 1024) return "That password is too long.";
  return null;
}

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    // The locally chosen name wins over the provider's. A player who typed
    // a name for the board should see that name, not whatever their Google
    // profile happens to say.
    displayName: storedDisplayName(),
    isAnonymous: user.isAnonymous,
    hasProvider: user.providerData.length > 0,
    email: user.email
  };
}

function emit(): void {
  for (const listener of listeners) listener(currentUser);
}

export function onAuthChanged(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentUser);
  return () => listeners.delete(listener);
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

/**
 * Starts the anonymous session and begins tracking auth state. Safe to
 * call repeatedly — the guard makes every call after the first a no-op, so
 * screens can call it defensively on mount.
 *
 * Resolves to null when the app has no cloud config, when sign-in is
 * blocked (some privacy modes reject the third-party storage Firebase Auth
 * needs), or on any SDK error. Every one of those is a normal offline
 * session, not a failure state the player should be shown.
 */
export async function ensureSignedIn(): Promise<AuthUser | null> {
  if (!isCloudConfigured()) return null;

  const services = await getFirebase();
  if (!services) return null;

  try {
    const { onAuthStateChanged, signInAnonymously } = await import("firebase/auth");

    if (!watching) {
      watching = true;
      onAuthStateChanged(services.auth, (user) => {
        currentUser = user ? toAuthUser(user) : null;
        emit();
      });
    }

    if (!services.auth.currentUser) await signInAnonymously(services.auth);

    // onAuthStateChanged fires asynchronously, so currentUser may not be
    // populated yet even though sign-in has resolved. Read straight off the
    // SDK for this call's return value rather than making callers poll.
    const user = services.auth.currentUser;
    if (user) currentUser = toAuthUser(user);
    return currentUser;
  } catch (error) {
    console.warn("[auth] anonymous sign-in unavailable; continuing offline", error);
    return null;
  }
}

export type LinkResult =
  | { ok: true; user: AuthUser; mergedExistingAccount: boolean }
  | { ok: false; reason: string };

/**
 * Upgrades the current anonymous session to a Google account, preserving
 * the uid where possible. See the module comment for why this links rather
 * than signs in.
 */
export async function linkGoogleAccount(): Promise<LinkResult> {
  const services = await getFirebase();
  if (!services) return { ok: false, reason: "Cloud features are not configured for this build." };

  const auth = services.auth;
  const authModule = await import("firebase/auth");
  const provider = new authModule.GoogleAuthProvider();

  try {
    const existing = auth.currentUser;
    if (existing && existing.isAnonymous) {
      const credential = await authModule.linkWithPopup(existing, provider);
      currentUser = toAuthUser(credential.user);
      emit();
      return { ok: true, user: currentUser, mergedExistingAccount: false };
    }

    const credential = await authModule.signInWithPopup(auth, provider);
    currentUser = toAuthUser(credential.user);
    emit();
    return { ok: true, user: currentUser, mergedExistingAccount: false };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";

    // The player has used this Google account on another device. Their
    // progress lives under that uid, so sign in to it and let the caller
    // merge the local history in (profileStore.mergeProgress).
    if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
      try {
        const credential = await authModule.signInWithPopup(auth, provider);
        currentUser = toAuthUser(credential.user);
        emit();
        return { ok: true, user: currentUser, mergedExistingAccount: true };
      } catch (innerError) {
        return { ok: false, reason: describeAuthError(innerError) };
      }
    }

    return { ok: false, reason: describeAuthError(error) };
  }
}

/**
 * Creates an account, or attaches one to the session already in progress.
 *
 * The linking path is the important half. A player who has been playing as
 * a guest already has a uid with real progress under it. `linkWithCredential`
 * attaches the new email/password to *that* uid, so the account they just
 * made already owns everything they had done. Calling `createUser...`
 * instead would mint a fresh uid and silently orphan the lot — which is
 * exactly the bug that makes people distrust "sign up to save your
 * progress" buttons.
 */
export async function signUpWithEmail(email: string, password: string, displayName?: string): Promise<LinkResult> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, reason: emailError };
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, reason: passwordError };

  const services = await getFirebase();
  if (!services) return { ok: false, reason: "Cloud features are not configured for this build." };

  const auth = services.auth;
  const authModule = await import("firebase/auth");
  const clean = email.trim();

  if (displayName) setStoredDisplayName(displayName);

  try {
    const existing = auth.currentUser;

    if (existing && existing.isAnonymous) {
      const credential = authModule.EmailAuthProvider.credential(clean, password);
      const result = await authModule.linkWithCredential(existing, credential);
      await applyProfileName(result.user);
      currentUser = toAuthUser(result.user);
      emit();
      return { ok: true, user: currentUser, mergedExistingAccount: false };
    }

    const result = await authModule.createUserWithEmailAndPassword(auth, clean, password);
    await applyProfileName(result.user);
    currentUser = toAuthUser(result.user);
    emit();
    return { ok: true, user: currentUser, mergedExistingAccount: false };
  } catch (error) {
    return { ok: false, reason: describeAuthError(error) };
  }
}

/**
 * Signs in to an existing account.
 *
 * Note what this deliberately does NOT do: it does not try to link to the
 * anonymous session first. Signing in means "I already have progress
 * somewhere" — the uid switches to the existing account, and
 * `profileStore.syncWithCloud()` then merges whatever was played locally
 * into it, best-of per level. That merge is what stops a guest run on this
 * device from being lost, and equally stops it from overwriting a better
 * history stored under the account.
 */
export async function signInWithEmail(email: string, password: string): Promise<LinkResult> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, reason: emailError };
  if (password.length === 0) return { ok: false, reason: "Enter your password." };

  const services = await getFirebase();
  if (!services) return { ok: false, reason: "Cloud features are not configured for this build." };

  try {
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const result = await signInWithEmailAndPassword(services.auth, email.trim(), password);
    currentUser = toAuthUser(result.user);
    emit();
    return { ok: true, user: currentUser, mergedExistingAccount: true };
  } catch (error) {
    return { ok: false, reason: describeAuthError(error) };
  }
}

/**
 * Sends a password reset email.
 *
 * Always reports success, even for an address with no account. Saying "no
 * account exists for that email" would turn this form into a way to test
 * which addresses are registered, which is worth more to someone probing
 * the game than the marginal clarity is worth to a player who mistyped.
 */
export async function sendPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, message: emailError };

  const services = await getFirebase();
  if (!services) return { ok: false, message: "Cloud features are not configured for this build." };

  try {
    const { sendPasswordResetEmail } = await import("firebase/auth");
    await sendPasswordResetEmail(services.auth, email.trim());
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    // A genuine connectivity or configuration problem is worth surfacing;
    // "that user doesn't exist" is not (see above).
    if (code === "auth/network-request-failed" || code === "auth/operation-not-allowed") {
      return { ok: false, message: describeAuthError(error) };
    }
  }
  return { ok: true, message: "If that address has an account, a reset link is on its way." };
}

/** Mirrors the chosen display name onto the Firebase Auth profile, so the console shows something recognisable next to the email. Best-effort: a failure here must not fail a sign-up that otherwise worked. */
async function applyProfileName(user: User): Promise<void> {
  try {
    const { updateProfile } = await import("firebase/auth");
    await updateProfile(user, { displayName: storedDisplayName() });
  } catch {
    /* cosmetic only */
  }
}

export async function signOutPlayer(): Promise<void> {
  const services = await getFirebase();
  if (!services) return;
  const { signOut } = await import("firebase/auth");
  await signOut(services.auth);
  currentUser = null;
  emit();
}

/** Turns an SDK error code into something worth showing a player. Anything unrecognised stays generic rather than leaking an internal code into the UI. */
function describeAuthError(error: unknown): string {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
    case "auth/network-request-failed":
      return "Couldn't reach the network. Your progress is still saved on this device.";
    case "auth/operation-not-allowed":
      return "That sign-in method isn't enabled for this project yet. See docs/DEPLOY.md.";
    case "auth/email-already-in-use":
      return "There's already an account with that email. Try signing in instead.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/weak-password":
      return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    // Modern Firebase collapses wrong-password and no-such-user into one
    // code on purpose, so an attacker can't enumerate registered addresses.
    // Keep the message just as vague.
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match an account.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    case "auth/user-disabled":
      return "That account has been disabled.";
    case "auth/requires-recent-login":
      return "Please sign in again to make that change.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorised for sign-in.";
    default:
      return "Sign-in didn't work. Your progress is still saved on this device.";
  }
}
