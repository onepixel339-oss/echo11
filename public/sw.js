/**
 * ECHO service worker — real offline support.
 *
 * Strategy per request class (same-origin only; provider traffic is never
 * intercepted):
 *   app shell (navigations)  → network-first, cached shell fallback → offline
 *                              the SPA boots from cache when the network dies
 *   static assets (hashed)   → cache-first  (/_next/static, icons, fonts…)
 *   API GET                  → network-first with cache fallback, and an
 *                              offline JSON envelope so the UI can degrade
 *                              gracefully instead of hanging
 *   anything else (GET)      → network-first with cache fallback
 *
 * Precache is per-file fault-tolerant: one missing asset can no longer
 * silently kill the whole shell (the old cache.addAll() failure mode).
 */

const CACHE = "echo-shell-v3";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/logo.svg",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // per-file add: a single 404 must not abort the entire precache
        Promise.allSettled(PRECACHE.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Immutable, content-hashed or versioned assets → cache-first. */
function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/logo.svg" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|avif|ico)$/.test(pathname)
  );
}

const OFFLINE_JSON = new Response(
  JSON.stringify({ ok: false, error: "offline" }),
  { status: 503, headers: { "content-type": "application/json" } },
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch provider traffic

  // --- API: network-first, cache fallback, offline JSON envelope ----------
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // cache only successful GET api responses (translations etc.)
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy).catch(() => undefined));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit ?? OFFLINE_JSON.clone()),
        ),
    );
    return;
  }

  // --- static assets: cache-first (they are hashed/immutable) -------------
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy).catch(() => undefined));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // --- navigations & everything else: network-first with shell fallback ---
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy).catch(() => undefined));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit ?? caches.match("/"))
          .then((hit) => hit ?? new Response("Offline", { status: 503 })),
      ),
  );
});

// allow the page to trigger immediate activation of a new worker version
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
