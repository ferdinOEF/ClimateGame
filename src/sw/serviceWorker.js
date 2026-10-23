/* Section 30.12 (festival mode): the game works offline after one visit.
 *
 * Built by the Vite plugin in vite.config.ts, which puts the build's file list and a version in place of the two
 * markers below and writes this file out as /sw.js. On install it stores every file the game needs; pages are
 * fetched from the network first (so a new deploy shows when online) and from the store when offline, and so are the
 * public files whose names never change (the art, the street map: a retaken picture shows at once); the built files
 * (/assets/, named by their contents) come from the store first. A new version takes over once every tab of the
 * old one has closed.
 */
const VERSION = "__SW_VERSION__";
const PRECACHE = __SW_FILES__;
const CACHE = `riptide-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("riptide-") && key !== CACHE).map((key) => caches.delete(key))))
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/assets/") && request.mode !== "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreVary: true }).then((hit) => hit || Response.error()))
    );
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok) caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html", { ignoreVary: true }).then((hit) => hit || caches.match("/", { ignoreVary: true })))
    );
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
