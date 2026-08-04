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

export async function runPrintSelectionReminders(
  /**
   * `dryRun` = calcular a quién le tocaría el recordatorio SIN mandar nada.
   * Existe para poder verificar el barrido contra los datos reales sin
   * escribirle a las clientas — probar esto en vivo cuesta correos de verdad.
   */
  opts: { dryRun?: boolean } = {},
): Promise<PrintReminderResult> {
  const sb = untypedService()
  const res: PrintReminderResult = {
    candidatas: 0,
    enviados: 0,
    yaEnviadoHoy: 0,
    vencidas: 0,
    errores: 0,
  }

  // Galerías ENTREGADAS sin selección enviada.
  //
  // OJO: NO se filtra por `print_selection_enabled`. Esa columna es solo una
  // marca interna ("ya mandamos la invitación una vez") y está en falso en casi
  // todas, incluso donde el cliente sí llegó a seleccionar. La regla de verdad
  // —la misma que ve el cliente en su galería— es: el plan incluye impresiones
  // Y ya hay fotos entregadas. Vive en `getGalleryPrintState`.
  const { data: galRaw } = await sb
    .from("galleries")
    .select(
      "id, studio_id, name, client_id, delivery_ready_at, gallery_type, print_submitted_at",
    )
    .is("print_submitted_at", null)
    .is("deleted_at", null)
    .not("client_id", "is", null)
    .or("delivery_ready_at.not.is.null,gallery_type.eq.final_delivery")

  const galerias = (galRaw ?? []) as Array<{
    id: string
    studio_id: string
    name: string | null
    client_id: string | null
    delivery_ready_at: string | null
  }>
  if (galerias.length === 0) return res

  const hoy = hoyRD()
  const { getGalleryPrintState } = await import("./print-selection.service")

  for (const g of galerias) {
    try {
      // ¿De verdad tiene algo que elegir? Si el plan no incluye impresiones, o
      // todas son automáticas (se imprimen todas sin que él escoja), no hay
      // nada que recordarle.
      const estado = await getGalleryPrintState(g.id)
      const tieneQueElegir =
        !!estado &&
        estado.enabled &&
        !estado.submitted &&
        estado.categories.some((c) => c.mode === "manual" && c.allowed > 0)
      if (!tieneQueElegir) continue

      res.candidatas += 1

      if (g.delivery_ready_at && diasDesde(g.delivery_ready_at) > MAX_DIAS) {
        res.vencidas += 1
        continue
      }

      // ¿Ya salió el recordatorio hoy para esta galería?
      //
      // La tabla es `email_queue`, NO `emails`. Con el nombre equivocado la
      // consulta fallaba en silencio (count=null → 0) y este freno no existía:
      // cada corrida mandaba otro correo al mismo cliente.
      const { count, error: errCola } = await sb
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", g.studio_id)
        .eq("template_slug", "print_selection_reminder")
        .eq("related_entity_id", g.id)
        .gte("created_at", `${hoy}T00:00:00`)
      if (errCola) {
        // Ante la duda, NO se manda: mejor saltarse un recordatorio que
        // duplicarle el correo a una clienta.
        console.error("[print-reminder] no se pudo comprobar la cola", errCola)
        res.errores += 1
        continue
      }
      if ((count ?? 0) > 0) {
        res.yaEnviadoHoy += 1
        continue
      }

      if (opts.dryRun) {
        res.enviados += 1 // "se le mandaría"
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
