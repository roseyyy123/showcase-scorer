// Offline support: the app shell is cached on install; the on-device reader
// files (about 7 MB) are cached the first time they're used.
const VERSION = "showcase-v4";
const SHELL = ["./", "index.html", "styles.css", "app.js", "species.js", "reader-ocr.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "vendor/tesseract/tesseract.min.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  const isVendor = url.pathname.includes("/vendor/");
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit && isVendor) return hit;                       // big files never change within a version
    try {
      const res = await fetch(e.request);                  // app files: network first, so updates arrive
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      if (hit) return hit;
      throw err;
    }
  })());
});
