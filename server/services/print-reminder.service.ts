import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { getAutomation, getPausedClientIds } from "./email-automation.service"

/**
 * Recordatorio al cliente que ya recibió su galería final y todavía no ha
 * elegido sus impresiones.
 *
 * Sin esa selección el estudio no puede mandar nada a imprimir: la sesión se
 * queda parada esperando algo que el cliente ni recuerda que le toca.
 *
 * El ritmo y el tope los pone el estudio en Ajustes → Automatizaciones
 * (`email_automations`, clave `print_selection_reminder`). Antes eran
 * constantes aquí y cambiarlos exigía un deploy.
 *
 * Corre una vez al día desde el cron. Idempotente: si ya salió un recordatorio
 * dentro de la ventana configurada, no manda otro — así ni un reintento del
 * cron ni un cambio de ritmo duplican correos.
 */

export interface PrintReminderResult {
  candidatas: number
  enviados: number
  yaAvisado: number
  vencidas: number
  pausadas: number
  errores: number
}

const RD_TZ = "America/Santo_Domingo"

/** Fecha en RD, 'YYYY-MM-DD', desplazada `offsetDias` respecto a hoy. */
function fechaRD(offsetDias = 0): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RD_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDias * 86_400_000))
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
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
    yaAvisado: 0,
    vencidas: 0,
    pausadas: 0,
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

  const { getGalleryPrintState } = await import("./print-selection.service")

  // Config y lista de pausados: una sola lectura por estudio, no por galería.
  const configs = new Map<string, Awaited<ReturnType<typeof getAutomation>>>()
  const pausados = new Map<string, Set<string>>()
  for (const studioId of new Set(galerias.map((g) => g.studio_id))) {
    configs.set(
      studioId,
      await getAutomation(studioId, "print_selection_reminder"),
    )
    try {
      pausados.set(studioId, await getPausedClientIds(studioId))
    } catch (err) {
      // Sin la lista de pausados no se puede garantizar el freno. Se salta el
      // estudio entero: mejor perder una ronda de recordatorios que escribirle
      // a quien el estudio pidió no molestar.
      console.error("[print-reminder] estudio saltado", studioId, err)
      res.errores += 1
    }
  }

  for (const g of galerias) {
    try {
      const cfg = configs.get(g.studio_id)
      if (!cfg || !cfg.enabled) continue

      const listaPausados = pausados.get(g.studio_id)
      if (!listaPausados) continue // estudio saltado arriba
      if (g.client_id && listaPausados.has(g.client_id)) {
        res.pausadas += 1
        continue
      }

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

      const tope = cfg.max_days
      if (tope && g.delivery_ready_at && diasDesde(g.delivery_ready_at) > tope) {
        res.vencidas += 1
        continue
      }

      // ¿Ya salió un recordatorio dentro de la ventana?
      //
      // Ventana por CALENDARIO en RD, no por horas: con "cada 3 días" y el cron
      // a la misma hora, restar 72h exactas haría que el envío anterior cayera
      // dentro de la ventana por segundos y el aviso se fuera corriendo un día
      // en cada vuelta.
      //
      // La tabla es `email_queue`, NO `emails`. Con el nombre equivocado la
      // consulta fallaba en silencio (count=null → 0) y este freno no existía:
      // cada corrida mandaba otro correo al mismo cliente.
      const cada = Math.max(1, cfg.every_days ?? 3)
      const desde = `${fechaRD(-(cada - 1))}T00:00:00-04:00`
      const { count, error: errCola } = await sb
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", g.studio_id)
        .eq("template_slug", "print_selection_reminder")
        .eq("related_entity_id", g.id)
        .gte("created_at", desde)
      if (errCola) {
        // Ante la duda, NO se manda: mejor saltarse un recordatorio que
        // duplicarle el correo a una clienta.
        console.error("[print-reminder] no se pudo comprobar la cola", errCola)
        res.errores += 1
        continue
      }
      if ((count ?? 0) > 0) {
        res.yaAvisado += 1
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
