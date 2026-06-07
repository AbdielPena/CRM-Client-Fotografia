import { NextResponse, type NextRequest } from "next/server"

import { processWorkflowStages } from "@/server/services/workflow.service"

/**
 * Cron job: genera las tareas de etapa del pipeline que dependen del tiempo
 * (ej. "Enviar selección" pasado el día de la sesión) y refresca fechas
 * estimadas de entrega. Correr 1x/día.
 *
 * Auth: `Authorization: Bearer <WORKFLOW_CRON_TOKEN>` env var.
 * (Fallback a TASK_REMINDERS_CRON_TOKEN para reusar el token existente si no se
 * configura uno nuevo.)
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected =
    process.env.WORKFLOW_CRON_TOKEN || process.env.TASK_REMINDERS_CRON_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "WORKFLOW_CRON_TOKEN no configurado" },
      { status: 500 },
    )
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await processWorkflowStages()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      {
        error: "WORKFLOW_STAGES_FAILED",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST con Authorization header" },
    { status: 405 },
  )
}
