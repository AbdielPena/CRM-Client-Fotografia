import "server-only"

import { NextRequest, NextResponse } from "next/server"

import { syncAllActiveAccounts, syncMailAccount } from "@/server/services/mail-imap-sync.service"

/**
 * Endpoint del cron job para sync IMAP del módulo Mail.
 *
 * Llamado por Supabase Edge Function / cron externo c/5min. Autenticado vía
 * Bearer token (MAIL_SYNC_TOKEN env var) para evitar que llamadas anónimas
 * disparen sincronizaciones costosas.
 *
 * Modes:
 *   - GET /api/mail/sync           → sync all active accounts (entry cron)
 *   - POST /api/mail/sync/[acc_id] → sync una cuenta específica
 *
 * Tradeoffs:
 *   - GET es seguro por el Bearer; no muta estado del que llama (solo del job)
 *   - Idempotente: si dos crons disparan al mismo tiempo, el sync_status='syncing'
 *     bloquea el segundo (devuelve "already running")
 *   - Timeout: la Edge Function tiene ~10s soft cap. Cap 100 mensajes/cuenta
 *     y máx 50 cuentas por run protegen.
 */

const EXPECTED_TOKEN = process.env.MAIL_SYNC_TOKEN

function checkAuth(req: NextRequest): { ok: boolean; reason?: string } {
  if (!EXPECTED_TOKEN) {
    return { ok: false, reason: "MAIL_SYNC_TOKEN no configurado en el servidor" }
  }
  const header = req.headers.get("authorization")
  if (!header) return { ok: false, reason: "Falta header Authorization" }
  const [scheme, token] = header.split(" ")
  if (scheme !== "Bearer" || token !== EXPECTED_TOKEN) {
    return { ok: false, reason: "Token inválido" }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const result = await syncAllActiveAccounts()
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      summary: {
        total: result.total,
        successes: result.successes,
        failures: result.failures,
      },
      details: result.results.map((r) =>
        r.ok
          ? {
              accountId: r.stats.accountId,
              email: r.stats.email,
              ok: true,
              messagesNew: r.stats.messagesNew,
              messagesSkipped: r.stats.messagesSkipped,
              threadsTouched: r.stats.threadsTouched,
              attachmentsUploaded: r.stats.attachmentsUploaded,
              errors: r.stats.errors.length,
              durationMs: r.stats.durationMs,
            }
          : { accountId: r.accountId, ok: false, error: r.error },
      ),
    })
  } catch (err) {
    console.error("[mail/sync] crash:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    )
  }
}

/**
 * POST /api/mail/sync/[accountId]?studio_id=<uuid>
 * Disparo manual por studio (usado desde UI "Sincronizar ahora").
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { studioId, accountId } = body as {
    studioId?: string
    accountId?: string
  }

  if (!studioId || !accountId) {
    return NextResponse.json(
      { error: "Body requiere { studioId, accountId }" },
      { status: 400 },
    )
  }

  const result = await syncMailAccount(studioId, accountId)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, stats: result.stats })
}
