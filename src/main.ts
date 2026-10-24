// Section 30.12: the title font, bundled (works offline; no Google Fonts).
import "@fontsource/fraunces/latin-700.css";
// Section 33.1: Harbour Morning's colour tokens, before the sheets that use them.
import "@ui/theme.css";
import "@ui/hud.css";
import "@ui/screens/screens.css";
import "@ui/panjim/panjim.css";
import { AppShell } from "@app/appShell";
import { clearOldProgress } from "@services/storagePolicy";

/**
 * Application entry point.
 *
 * Deliberately tiny. This file used to BE the game — 1100 lines that built
 * a scene at import time and ran one endless sandbox run. That logic now
 * lives in `@app/gameSession`, parameterised by a level and disposable, and
 * `@app/appShell` decides which screen is showing and when a session
 * starts or stops.
 *
 * All this does is mount the shell and get out of the way.
 *
 * Stylesheets are imported here rather than linked from index.html so Vite
 * fingerprints and inlines them through the normal asset pipeline — a
 * `<link>` to a `/src/...` path works in dev and breaks in a production
 * build, which is exactly the class of bug that only shows up after deploy.
 */
const root = document.getElementById("app");

if (!root) {
  // Nothing sensible to recover to: the single mount point the whole app
  // hangs off is missing, which means index.html and this bundle disagree.
  throw new Error("Riptide Rising: #app mount point not found in index.html");
}

// Section 28.2: nothing about progress is saved; what an older version saved is cleared before anything reads it.
clearOldProgress();
new AppShell(root);

// The boot splash in index.html covers the gap between first paint and the
// bundle being ready. Removing it here — after the shell has rendered its
// first screen — means a slow connection shows the splash rather than a
// blank page, and it never lingers over a live menu.
document.getElementById("boot-splash")?.remove();

// Section 30.12 (festival mode): after one visit the game works offline (the service worker, vite.config.ts).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
