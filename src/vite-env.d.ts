/// <reference types="vite/client" />

/**
 * Types for the Firebase configuration Vite injects at build time.
 *
 * Every field is optional and typed as a plain string: a build with no
 * Firebase project is a supported, first-class configuration (the game
 * falls back to localStorage — see src/services/env.ts), so declaring
 * these as required would make TypeScript insist on a state the app is
 * explicitly designed to work without.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_EMULATORS?: string;
  /** "true" turns the email sheet and account features back on. See src/app/features.ts. */
  readonly VITE_REQUIRE_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
