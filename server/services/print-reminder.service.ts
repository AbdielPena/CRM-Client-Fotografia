import "server-only"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Recordatorio DIARIO al cliente que ya recibió su galería final y todavía no
 * ha elegido sus impresiones.
 *
 * Sin esa selección el estudio no puede mandar nada a imprimir: la sesión se
 * queda parada esperando algo que el cliente ni recuerda que le toca. Por eso
 * el aviso es diario y no semanal — y se apaga solo en cuanto envía.
 *
 * Corre una vez al día desde el cron. Idempotente: si ya salió un recordatorio
 * hoy para esa galería, no manda otro (así un reintento del cron no duplica).
 */

/**
 * Tope de seguridad. Un correo diario para siempre a una dirección muerta
 * termina quemando la reputación del servidor de correo. A los 30 días se deja
 * de insistir por correo — la tarea del estudio sigue viva en el CRM.
 */
const MAX_DIAS = 30

export interface PrintReminderResult {
  candidatas: number
  enviados: number
  yaEnviadoHoy: number
  vencidas: number
  errores: number
}

/** Fecha de hoy en RD, 'YYYY-MM-DD'. */
function hoyRD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86_400_000)
}

export async function runPrintSelectionReminders(): Promise<PrintReminderResult> {
  const sb = untypedService()
  const res: PrintReminderResult = {
    candidatas: 0,
    enviados: 0,
    yaEnviadoHoy: 0,
    vencidas: 0,
    errores: 0,
  }

  // Galerías con impresiones habilitadas, ya entregadas y SIN selección enviada.
  const { data: galRaw } = await sb
    .from("galleries")
    .select(
      "id, studio_id, name, client_id, delivery_ready_at, print_selection_enabled, print_submitted_at",
    )
    .eq("print_selection_enabled", true)
    .is("print_submitted_at", null)
    .not("delivery_ready_at", "is", null)
    .is("deleted_at", null)

  const galerias = (galRaw ?? []) as Array<{
    id: string
    studio_id: string
    name: string | null
    client_id: string | null
    delivery_ready_at: string
  }>
  res.candidatas = galerias.length
  if (galerias.length === 0) return res

  const hoy = hoyRD()

  for (const g of galerias) {
    try {
      if (diasDesde(g.delivery_ready_at) > MAX_DIAS) {
        res.vencidas += 1
        continue
      }

      // ¿Ya salió el recordatorio hoy para esta galería?
      const { count } = await sb
        .from("emails")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", g.studio_id)
        .eq("template_slug", "print_selection_reminder")
        .eq("related_entity_id", g.id)
        .gte("created_at", `${hoy}T00:00:00`)
      if ((count ?? 0) > 0) {
        res.yaEnviadoHoy += 1
        continue
      }

      const { sendPrintSelectionReminder } = await import("./print-email.service")
      const ok = await sendPrintSelectionReminder(g.id)
      if (ok) res.enviados += 1
    } catch (err) {
      res.errores += 1
      console.error("[print-reminder] galería", g.id, err)
    }
  }

  return res
}
