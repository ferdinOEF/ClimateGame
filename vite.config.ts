import { defineConfig, type Plugin } from "vite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

/**
 * Section 30.12 (festival mode): writes /sw.js (src/sw/serviceWorker.js) into the build with the list of every file
 * the game needs offline: the built page and its scripts, styles, fonts and pictures, and the public files the game
 * loads (the board's street map, the art, the two partner logos). Not the source maps or the Firebase chunk (the
 * cloud features are off by default). Only in a production build; the dev server has no service worker.
 */
function serviceWorker(): Plugin {
  const publicFiles = (dir: string, base = ""): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const rel = `${base}/${entry.name}`;
      if (entry.isDirectory()) return publicFiles(path.join(dir, entry.name), rel);
      return [rel];
    });
  return {
    name: "riptide-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((file) => !file.endsWith(".map") && !/firebase/.test(file))
        .map((file) => `/${file}`);
      const fromPublic = publicFiles(path.resolve(__dirname, "public")).filter((file) => !file.startsWith("/branding/") || /oneearth-foundation-256\.webp$|gokhush-charitable-trust\.svg$/.test(file));
      const files = [...new Set(["/", ...built, ...fromPublic])].sort();
      // The version follows the contents too: a public picture retaken under the same name is fetched afresh.
      const template = fs.readFileSync(path.resolve(__dirname, "src/sw/serviceWorker.js"), "utf8");
      const hash = crypto.createHash("sha256").update(files.join("\n")).update(template);
      for (const file of fromPublic) hash.update(fs.readFileSync(path.resolve(__dirname, "public", `.${file}`)));
      const version = hash.digest("hex").slice(0, 12);
      const source = template
        .replace("__SW_VERSION__", version)
        .replace("__SW_FILES__", JSON.stringify(files));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    }
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
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
