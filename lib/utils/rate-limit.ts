/**
 * Rate limiter in-memory simple (token bucket / sliding window).
 *
 * Para una sola instancia Node como tenemos en cPanel BanaHosting,
 * un Map en memoria del proceso es suficiente. Para escalar a múltiples
 * instancias o serverless, migrar a Upstash Redis.
 *
 * Uso desde un endpoint:
 *   const blocked = rateLimit({ key: `signup:${ip}`, max: 5, windowMs: 60_000 })
 *   if (blocked) return new Response("Too many requests", { status: 429 })
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Limpieza periódica para no crecer indefinido en memoria
const CLEANUP_INTERVAL_MS = 60_000
let cleanupTimer: NodeJS.Timeout | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt < now) buckets.delete(key)
    }
  }, CLEANUP_INTERVAL_MS)
  // No bloquear el shutdown del proceso
  cleanupTimer.unref?.()
}

export interface RateLimitOptions {
  /** Identificador único del bucket (ej: `login:${ip}`, `signup:${userId}`) */
  key: string
  /** Cantidad máxima de requests permitidos en la ventana */
  max: number
  /** Ventana en milisegundos */
  windowMs: number
}

export interface RateLimitResult {
  blocked: boolean
  remaining: number
  resetAt: number
}

/**
 * Chequea + incrementa el contador. Devuelve `blocked: true` si excedió.
 */
export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  ensureCleanup()
  const now = Date.now()
  const existing = buckets.get(opts.key)

  if (!existing || existing.resetAt < now) {
    const bucket: Bucket = { count: 1, resetAt: now + opts.windowMs }
    buckets.set(opts.key, bucket)
    return { blocked: false, remaining: opts.max - 1, resetAt: bucket.resetAt }
  }

  existing.count += 1
  if (existing.count > opts.max) {
    return { blocked: true, remaining: 0, resetAt: existing.resetAt }
  }
  return {
    blocked: false,
    remaining: opts.max - existing.count,
    resetAt: existing.resetAt,
  }
}

/**
 * Extrae IP del request (priorizando x-forwarded-for de Cloudflare/LiteSpeed).
 */
export function getClientIp(req: Request | { headers: Headers }): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown"
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}

/**
 * Helper que arma la response 429 con headers estándar.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
  return new Response(
    JSON.stringify({
      error: "Demasiadas solicitudes. Intentá en unos segundos.",
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfter),
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  )
}
