"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { availabilityRepo } from "@/server/repositories"
import { logActivity } from "@/server/services/activity.service"

type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

function asTimeOrNull(v: FormDataEntryValue | null): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  // Acepta HH:MM o HH:MM:SS; normaliza a HH:MM:SS para Postgres time
  const parts = s.split(":")
  if (parts.length < 2) return null
  const hh = parts[0]!.padStart(2, "0")
  const mm = parts[1]!.padStart(2, "0")
  const ss = (parts[2] ?? "00").padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

function asDateOrNull(v: FormDataEntryValue | null): string | null {
  if (!v) return null
  const s = String(v).trim()
  // Asumimos YYYY-MM-DD (input type="date")
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/**
 * Reemplaza completamente el horario semanal del studio.
 *
 * El payload es un JSON stringifieado con shape:
 *   Array<{ dayOfWeek: 0..6, open: boolean,
 *           windows: Array<{ startTime: "HH:MM", endTime: "HH:MM" }> }>
 *
 * Estrategia: delete hard todas las rules de tipo weekly_open/weekly_closed
 * del studio, luego insert de las nuevas. Mantiene date_closed y
 * date_open_override intactos (esos se gestionan aparte).
 */
export async function saveWeeklyScheduleAction(
  _: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStudioAuth()
  if (session.role === "viewer") {
    return { ok: false, error: "No tienes permiso para editar horarios" }
  }

  const raw = formData.get("schedule")
  if (!raw) return { ok: false, error: "Payload vacío" }

  let payload: Array<{
    dayOfWeek: number
    open: boolean
    windows: Array<{ startTime: string; endTime: string }>
  }>
  try {
    payload = JSON.parse(String(raw))
  } catch {
    return { ok: false, error: "Payload inválido (JSON)" }
  }

  // Validación mínima
  for (const d of payload) {
    if (typeof d.dayOfWeek !== "number" || d.dayOfWeek < 0 || d.dayOfWeek > 6) {
      return { ok: false, error: `Día inválido: ${d.dayOfWeek}` }
    }
    if (d.open && d.windows.length === 0) {
      return {
        ok: false,
        error: `El día ${d.dayOfWeek} está abierto pero sin franjas definidas`,
      }
    }
    for (const w of d.windows) {
      const start = asTimeOrNull(w.startTime)
      const end = asTimeOrNull(w.endTime)
      if (!start || !end) {
        return {
          ok: false,
          error: `Horario inválido en día ${d.dayOfWeek}`,
        }
      }
      if (start >= end) {
        return {
          ok: false,
          error: `El inicio debe ser antes que el fin (día ${d.dayOfWeek})`,
        }
      }
    }
  }

  try {
    // Cargar rules existentes para saber cuáles borrar
    const current = await availabilityRepo.listRules(session.studioId)
    const weeklyIds = current
      .filter(
        (r) =>
          r.rule_type === "weekly_open" || r.rule_type === "weekly_closed",
      )
      .map((r) => r.id)

    // Borra y reinserta — más simple y robusto que diff-ear
    for (const id of weeklyIds) {
      await availabilityRepo.deleteRule(id)
    }

    const DAY_LABELS = [
      "Domingo",
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
    ]
    for (const d of payload) {
      if (!d.open) {
        await availabilityRepo.upsertRule({
          studio_id: session.studioId,
          name: `${DAY_LABELS[d.dayOfWeek]} cerrado`,
          rule_type: "weekly_closed",
          day_of_week: d.dayOfWeek,
          is_active: true,
          metadata: { created_by: session.userId },
        })
      } else {
        for (const w of d.windows) {
          const start = asTimeOrNull(w.startTime)!
          const end = asTimeOrNull(w.endTime)!
          await availabilityRepo.upsertRule({
            studio_id: session.studioId,
            name: `${DAY_LABELS[d.dayOfWeek]} ${start.slice(0, 5)}–${end.slice(0, 5)}`,
            rule_type: "weekly_open",
            day_of_week: d.dayOfWeek,
            start_time: start,
            end_time: end,
            is_active: true,
            metadata: { created_by: session.userId },
          })
        }
      }
    }

    await logActivity({
      studioId: session.studioId,
      action: "availability.weekly_schedule_updated",
      entityType: "availability_rule",
      actorId: session.userId,
      description: "Horario semanal actualizado",
      metadata: { days: payload.length },
    })

    revalidatePath("/settings/availability")
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

/**
 * Agrega una regla de fecha (cierre puntual o apertura excepcional).
 */
export async function addDateRuleAction(
  _: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStudioAuth()
  if (session.role === "viewer") {
    return { ok: false, error: "No tienes permiso para editar horarios" }
  }

  const ruleType = String(formData.get("ruleType") ?? "")
  if (ruleType !== "date_closed" && ruleType !== "date_open_override") {
    return { ok: false, error: "Tipo de regla inválido" }
  }

  const startDate = asDateOrNull(formData.get("startDate"))
  const endDate = asDateOrNull(formData.get("endDate"))
  if (!startDate) {
    return { ok: false, error: "Fecha de inicio inválida" }
  }
  if (endDate && endDate < startDate) {
    return { ok: false, error: "La fecha fin no puede ser anterior al inicio" }
  }

  let startTime: string | null = null
  let endTime: string | null = null
  if (ruleType === "date_open_override") {
    startTime = asTimeOrNull(formData.get("startTime"))
    endTime = asTimeOrNull(formData.get("endTime"))
    if (!startTime || !endTime) {
      return { ok: false, error: "Horario requerido para apertura excepcional" }
    }
    if (startTime >= endTime) {
      return { ok: false, error: "El inicio debe ser antes que el fin" }
    }
  }

  const notes = String(formData.get("notes") ?? "").trim() || null

  const defaultName =
    ruleType === "date_closed"
      ? `Cerrado ${startDate}${endDate && endDate !== startDate ? ` → ${endDate}` : ""}`
      : `Apertura ${startDate} ${startTime}–${endTime}`

  try {
    await availabilityRepo.upsertRule({
      studio_id: session.studioId,
      name: notes ?? defaultName,
      rule_type: ruleType,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      is_active: true,
      metadata: {
        created_by: session.userId,
        notes: notes ?? null,
      },
    })

    await logActivity({
      studioId: session.studioId,
      action: "availability.date_rule_added",
      entityType: "availability_rule",
      actorId: session.userId,
      description:
        ruleType === "date_closed"
          ? `Fecha cerrada: ${startDate}${endDate ? ` → ${endDate}` : ""}`
          : `Apertura excepcional: ${startDate} ${startTime}–${endTime}`,
      metadata: { ruleType, startDate, endDate },
    })

    revalidatePath("/settings/availability")
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const session = await requireStudioAuth()
  if (session.role === "viewer") return

  const id = String(formData.get("id") ?? "")
  if (!id) return

  try {
    await availabilityRepo.deleteRule(id)
    await logActivity({
      studioId: session.studioId,
      action: "availability.rule_deleted",
      entityType: "availability_rule",
      entityId: id,
      actorId: session.userId,
    })
    revalidatePath("/settings/availability")
  } catch (err) {
    console.error("[deleteRuleAction]", err)
  }
}

// ──────────────────────────────────────────────────────────────────────
// Bloques manuales (tiempo personal, otros compromisos)
// ──────────────────────────────────────────────────────────────────────

export async function addManualBlockAction(
  _: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStudioAuth()
  if (session.role === "viewer") {
    return { ok: false, error: "No tienes permiso para bloquear la agenda" }
  }

  const startDate = asDateOrNull(formData.get("startDate"))
  const endDate = asDateOrNull(formData.get("endDate"))
  const startTime = asTimeOrNull(formData.get("startTime"))
  const endTime = asTimeOrNull(formData.get("endTime"))
  const title = String(formData.get("title") ?? "").trim() || "Bloqueo"
  const blockType = String(formData.get("blockType") ?? "manual")

  if (!startDate) return { ok: false, error: "Fecha de inicio inválida" }
  const finalEndDate = endDate ?? startDate

  // Santo Domingo: UTC-4 sin DST
  const OFFSET = "-04:00"
  const startAt = startTime
    ? `${startDate}T${startTime}${OFFSET}`
    : `${startDate}T00:00:00${OFFSET}`
  const endAt = endTime
    ? `${finalEndDate}T${endTime}${OFFSET}`
    : `${finalEndDate}T23:59:59${OFFSET}`

  const startIso = new Date(startAt).toISOString()
  const endIso = new Date(endAt).toISOString()
  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    return { ok: false, error: "El fin debe ser posterior al inicio" }
  }

  try {
    await availabilityRepo.createBlock({
      studio_id: session.studioId,
      starts_at: startIso,
      ends_at: endIso,
      block_type: blockType === "personal" ? "personal" : "manual",
      title,
      notes: String(formData.get("notes") ?? "").trim() || null,
      is_confirmed: true,
      metadata: { created_by: session.userId },
    })

    await logActivity({
      studioId: session.studioId,
      action: "availability.block_created",
      entityType: "availability_block",
      actorId: session.userId,
      description: `Bloque manual: ${title}`,
      metadata: { startIso, endIso, blockType },
    })

    revalidatePath("/settings/availability")
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export async function deleteBlockAction(formData: FormData): Promise<void> {
  const session = await requireStudioAuth()
  if (session.role === "viewer") return

  const id = String(formData.get("id") ?? "")
  if (!id) return

  try {
    await availabilityRepo.deleteBlock(id)
    await logActivity({
      studioId: session.studioId,
      action: "availability.block_deleted",
      entityType: "availability_block",
      entityId: id,
      actorId: session.userId,
    })
    revalidatePath("/settings/availability")
  } catch (err) {
    console.error("[deleteBlockAction]", err)
  }
}
