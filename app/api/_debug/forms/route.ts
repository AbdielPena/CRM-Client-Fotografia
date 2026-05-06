/**
 * Debug endpoint para diagnosticar el 500 en /settings/forms.
 * Devuelve el resultado real de listFormTemplates o el error específico.
 *
 * REMOVE ME una vez fixed.
 */
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const steps: Array<{ step: string; ok: boolean; data?: unknown; error?: string }> = []

  try {
    steps.push({ step: "start", ok: true })

    const { requireStudioAuth } = await import("@/server/middleware/auth")
    steps.push({ step: "import auth", ok: true })

    const session = await requireStudioAuth()
    steps.push({ step: "requireStudioAuth", ok: true, data: { studioId: session.studioId } })

    const { listFormTemplates } = await import("@/server/services/form.service")
    steps.push({ step: "import form.service", ok: true })

    const templates = await listFormTemplates(session.studioId)
    steps.push({ step: "listFormTemplates", ok: true, data: { count: templates.length } })

    const { countUnreadNotifications } = await import("@/server/services/notification.service")
    steps.push({ step: "import notification.service", ok: true })

    const unread = await countUnreadNotifications(session.studioId)
    steps.push({ step: "countUnreadNotifications", ok: true, data: { unread } })

    return NextResponse.json({ ok: true, steps, templates, unread })
  } catch (err) {
    steps.push({
      step: "ERROR",
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err),
    })
    return NextResponse.json(
      { ok: false, steps, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
