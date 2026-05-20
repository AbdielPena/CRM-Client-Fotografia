import { NextResponse, type NextRequest } from "next/server"

import {
  autoComputeMonthlyTithe,
} from "@/server/services/fin-tithe.service"
import { processFinSubscriptionDueCharges } from "@/server/services/fin-subscription.service"

/**
 * Cron diario que procesa jobs financieros automatizados.
 *
 * Tareas:
 *   1. Procesa charges de fin_subscriptions con proxima_fecha <= today
 *      (crea fin_subscription_charges + fin_transactions.gasto, avanza
 *      proxima_fecha al siguiente periodo)
 *   2. Si today es día 28, computa el diezmo del mes anterior para todos
 *      los studios (idempotente — re-corre OK)
 *
 * Auth: `Authorization: Bearer <FINANCE_CRON_TOKEN>` (env var).
 *
 * Llamado desde:
 *   - Supabase pg_cron via http extension (recomendado)
 *   - Vercel cron en vercel.json (si despliegue es Vercel)
 *   - cron de VPS via curl (si despliegue es self-hosted)
 *
 * Trigger manual:
 *   curl -X POST -H "Authorization: Bearer $TOKEN" \
 *     https://my.abbypixel.com/api/cron/finance-jobs
 *
 * Force tithe re-compute específico:
 *   curl -X POST -H "Authorization: Bearer $TOKEN" \
 *     "https://my.abbypixel.com/api/cron/finance-jobs?period=2026-04&force_tithe=1"
 */
export async function POST(req: NextRequest) {
  // Auth
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.FINANCE_CRON_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "FINANCE_CRON_TOKEN no configurado" },
      { status: 500 },
    )
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const todayParam = url.searchParams.get("today") ?? undefined
  const periodParam = url.searchParams.get("period") ?? undefined
  const forceTithe = url.searchParams.get("force_tithe") === "1"

  const today = todayParam ?? new Date().toISOString().slice(0, 10)
  const dayOfMonth = Number(today.slice(8, 10))

  // 1) Procesar subscriptions
  let subscriptionResults
  try {
    subscriptionResults = await processFinSubscriptionDueCharges({
      today,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: "SUBSCRIPTION_CRON_FAILED",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 },
    )
  }

  // 2) Tithe — día 28 o force explícito
  let titheResults: unknown[] | undefined
  if (dayOfMonth >= 28 || forceTithe) {
    try {
      titheResults = await autoComputeMonthlyTithe({ period: periodParam })
    } catch (err) {
      return NextResponse.json(
        {
          subscriptionResults,
          titheError: err instanceof Error ? err.message : "Unknown",
        },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({
    today,
    subscriptions: {
      processed: subscriptionResults.length,
      results: subscriptionResults,
    },
    tithe: titheResults
      ? {
          processed: titheResults.length,
          results: titheResults,
        }
      : { skipped: "Solo se procesa diezmo a partir del día 28 del mes" },
  })
}

// Bloquea GET para evitar trigger accidental desde browser
export async function GET() {
  return NextResponse.json(
    { error: "Use POST con Authorization header" },
    { status: 405 },
  )
}
