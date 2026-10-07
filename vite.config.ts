import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@render": path.resolve(__dirname, "src/render"),
      "@data": path.resolve(__dirname, "src/data"),
      "@ui": path.resolve(__dirname, "src/ui"),
      // Added with the campaign/production pass. Kept in step with the
      // matching `paths` block in tsconfig.json — Vite resolves these at
      // build time and TypeScript resolves them for the editor, and the
      // two silently disagree if only one is updated.
      "@app": path.resolve(__dirname, "src/app"),
      "@levels": path.resolve(__dirname, "src/levels"),
      "@services": path.resolve(__dirname, "src/services")
    }
  },

  build: {
    target: "es2022",
    // Source maps ship to production deliberately. This is a game, not a
    // product with secrets in its bundle: the Firebase web config is public
    // by design (see src/services/env.ts) and the real security boundary is
    // firestore.rules. Being able to read a real stack trace from a player's
    // bug report is worth far more than the obscurity.
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        /*
          Three.js and the Firebase SDK are the two heavyweight
          dependencies and they have completely different lifecycles: Three
          is needed the moment a level starts, Firebase only when a cloud
          feature is actually touched (and it is loaded through dynamic
          imports for exactly that reason — see src/services/firebase.ts).
          Splitting them apart keeps a change to one from invalidating the
          other's cached chunk on every deploy.
        */
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) return "firebase";
          return undefined;
        }
      }
    }
  },

  server: {
    port: 5173,
    // Convenience for testing on a real phone on the same network — the
    // touch/pinch camera controls genuinely need a device to evaluate.
    host: true
  },

  test: {
    environment: "node"
  }
});
