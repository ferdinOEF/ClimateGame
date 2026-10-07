import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { isCloudConfigured, readFirebaseConfig, useEmulators } from "./env";

/**
 * Lazy, single-instance Firebase bootstrap.
 *
 * Two things matter here.
 *
 * First, everything is behind a dynamic `import()`. The Firebase SDK is
 * comfortably the largest dependency in this project, and a player who
 * never signs in and never opens the leaderboard should never pay to
 * download it. Vite splits it into its own chunk (see vite.config.ts's
 * manualChunks), so the game boots on the game code alone and the SDK
 * arrives only when a cloud feature is actually used.
 *
 * Second, initialisation is memoised as a PROMISE, not as a value. Several
 * screens can ask for Firestore in the same tick on a cold start; caching
 * the in-flight promise means they all await one initialisation instead of
 * racing to create several apps.
 */

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let servicesPromise: Promise<FirebaseServices | null> | null = null;

async function initialise(): Promise<FirebaseServices | null> {
  const config = readFirebaseConfig();
  if (!config) return null;

  try {
    const [{ initializeApp, getApps, getApp }, authModule, firestoreModule] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore")
    ]);

    // Vite's HMR can re-run this module without tearing down the previous
    // app instance; reusing an existing one avoids a duplicate-app warning
    // (and, in dev, a genuinely confusing second auth listener).
    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);

    if (useEmulators()) {
      authModule.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      firestoreModule.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }

    return { app, auth, db };
  } catch (error) {
    // A failure here is not fatal to the game — it means this session is
    // offline-only. Log it so a misconfigured deploy is diagnosable, then
    // let every caller fall back to localStorage.
    console.warn("[firebase] initialisation failed; continuing offline", error);
    return null;
  }
}

/** Resolves to the initialised services, or null when the app is running without cloud config. Callers must handle null; that is the offline path, not an error. */
export function getFirebase(): Promise<FirebaseServices | null> {
  if (!isCloudConfigured()) return Promise.resolve(null);
  servicesPromise ??= initialise();
  return servicesPromise;
}

export { isCloudConfigured };
