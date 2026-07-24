import { NextResponse, type NextRequest } from "next/server"

import { runCollaboratorDebtSweep } from "@/server/services/collaborator-debt.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/collaborator-debt-sweep
 *
 * Barrido diario: por cada asignación cuya sesión YA PASÓ (y es posterior a la
 * fecha de corte del estudio), crea la cuenta por pagar en FinanzApp y avisa al
 * colaborador por correo. Idempotente: una asignación ya sellada
 * (`debt_registered_at`) no se vuelve a procesar.
 *
 * Auth: header `x-internal-key` (o Bearer). Mismo patrón que payment-reminders.
 * DRY-RUN por defecto; aplica con `?confirm=1`.
 * `?emails=0` registra la deuda SIN avisar al colaborador.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json(
      { error: "INTERNAL_API_KEY no configurada" },
      { status: 500 },
    )
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const confirm = req.nextUrl.searchParams.get("confirm") === "1"
  const sendEmails = req.nextUrl.searchParams.get("emails") !== "0"

  try {
    const result = await runCollaboratorDebtSweep({
      dryRun: !confirm,
      sendEmails,
    })
    return NextResponse.json({ ok: true, dryRun: !confirm, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sweep_failed" },
      { status: 500 },
    )
  }
}
