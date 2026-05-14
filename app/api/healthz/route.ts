import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "@/server/supabase/env"

/**
 * GET /api/healthz — liveness + readiness check.
 * Public, sin auth. 200 si DB OK, 503 si no.
 */
export const dynamic = "force-dynamic"
export const revalidate = 0

const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET() {
  const startedAt = Date.now()
  const ts = new Date().toISOString()

  let dbStatus: "ok" | "fail" = "fail"
  let dbError: string | undefined
  let dbLatencyMs: number | undefined

  try {
    const admin = createAdminClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const t0 = Date.now()
    const { error } = await admin.from("clients").select("id").limit(1)
    dbLatencyMs = Date.now() - t0
    if (error) dbError = error.message
    else dbStatus = "ok"
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(
    {
      ok: dbStatus === "ok",
      service: "studioflow-crm",
      db: dbStatus,
      db_latency_ms: dbLatencyMs,
      db_error: dbError,
      uptime_s: process.uptime ? Math.round(process.uptime()) : null,
      response_time_ms: Date.now() - startedAt,
      ts,
    },
    {
      status: dbStatus === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    },
  )
}
