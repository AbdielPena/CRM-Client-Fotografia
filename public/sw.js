// StudioFlow service worker — caching strategy mínimo y seguro.
//
// Reglas:
//   - Nunca cachear /api/*, /auth/*, ni navegaciones (HTML siempre fresh)
//   - Cache-first para estáticos: _next/static, /icons, fonts
//   - Stale-while-revalidate para imágenes públicas de galerías
//   - Si la red falla en navegación → fallback /offline.html
const VERSION = "v2"
const STATIC_CACHE = `studioflow-static-${VERSION}`
const RUNTIME_CACHE = `studioflow-runtime-${VERSION}`
const OFFLINE_URL = "/offline.html"

const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function shouldBypass(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.searchParams.has("nocache")
  )
}

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/manifest.webmanifest"
  )
}

function isPublicGalleryAsset(url) {
  // Renditions servidos desde Supabase Storage o CDN propia
  return (
    url.pathname.includes("/storage/v1/object/public/gallery-renditions/") ||
    url.hostname.endsWith("r2.cloudflarestorage.com")
  )
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (shouldBypass(url)) return

  // Navegaciones HTML → network, fallback offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || Response.error()),
      ),
    )
    return
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
    return
  }

  if (isPublicGalleryAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req)
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => cached || Response.error())
        return cached || fetchPromise
      }),
    )
  }
})
