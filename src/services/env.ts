/**
 * Firebase configuration, read from Vite's build-time environment.
 *
 * The whole cloud layer is OPTIONAL. If these variables are absent the game
 * runs exactly as before against localStorage — campaign, levels, stars,
 * achievements, personal bests, all of it. Only the shared leaderboard and
 * cross-device sync go away, and every screen that shows them degrades to
 * a "play offline" state rather than an error.
 *
 * That is not defensive politeness, it is what makes the project workable:
 * a contributor can clone, `npm install`, `npm run dev` and be playing in
 * a minute with no Firebase project of their own, and the production build
 * cannot be broken by a missing secret.
 *
 * On these keys being public: a Firebase web config is not a credential.
 * It identifies the project, and it ships in the client bundle of every
 * Firebase web app by design. What actually protects the data is
 * firestore.rules plus the API-key referrer restrictions described in
 * docs/DEPLOY.md — not the secrecy of this object.
 */
export interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function read(key: string): string {
  const value = (import.meta.env as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Returns the config only if every required field is present. A partially
 * filled `.env` is treated as no config at all — half-initialising the SDK
 * fails later, deeper, and with a much worse error than simply staying
 * offline.
 */
export function readFirebaseConfig(): FirebaseEnvConfig | null {
  const config: FirebaseEnvConfig = {
    apiKey: read("VITE_FIREBASE_API_KEY"),
    authDomain: read("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: read("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: read("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: read("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: read("VITE_FIREBASE_APP_ID")
  };

  const complete = Object.values(config).every((value) => value.length > 0);
  return complete ? config : null;
}

/** True when a complete Firebase config was built into this bundle. Every cloud call site checks this first. */
export function isCloudConfigured(): boolean {
  return readFirebaseConfig() !== null;
}

/** Point the SDK at local emulators instead of the real project (`npm run dev:emulated`). Keeps test data out of the production quota. */
export function useEmulators(): boolean {
  return read("VITE_FIREBASE_EMULATORS") === "true";
}
