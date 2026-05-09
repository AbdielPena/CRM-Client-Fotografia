"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireStudioAuth } from "@/server/middleware/auth"
import { availabilityRepo } from "@/server/repositories"
import { logActivity } from "@/server/services/activity.service"

type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

// ─── Validation schemas ─────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("ID inválido")

// HH:MM o HH:MM:SS
const timeStringSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato de hora inválido")

// YYYY-MM-DD (input type="date")
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido")

const weeklyWindowSchema = z.object({
  startTime: timeStringSchema,
  endTime: timeStringSchema,
})

const weeklyDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  open: z.boolean(),
  windows: z.array(weeklyWindowSchema),
})

const weekScheduleSchema = z.array(weeklyDaySchema).max(20)

const dateRuleSchema = z
  .object({
    ruleType: z.enum(["date_closed", "date_open_override"]),
    startDate: dateStringSchema,
    endDate: dateStringSchema.nullable().optional(),
    startTime: timeStringSchema.nullable().optional(),
    endTime: timeStringSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (d) =>
      !d.endDate || d.endDate >= d.startDate,
    { message: "La fecha fin no puede ser anterior al inicio", path: ["endDate"] },
  )

const manualBlockSchema = z
  .object({
    startDate: dateStringSchema,
    endDate: dateStringSchema.nullable().optional(),
    startTime: timeStringSchema.nullable().optional(),
    endTime: timeStringSchema.nullable().optional(),
    title: z.string().trim().min(1).max(200).default("Bloqueo"),
    notes: z.string().trim().max(500).nullable().optional(),
    blockType: z.enum(["personal", "manual"]).default("manual"),
  })

const deleteIdSchema = z.object({
  id: uuidSchema,
})

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

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(String(raw))
  } catch {
    return { ok: false, error: "Payload inválido (JSON)" }
  }

  const scheduleResult = weekScheduleSchema.safeParse(parsedJson)
  if (!scheduleResult.success) {
    const first = scheduleResult.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Schedule inválido",
    }
  }
  const payload = scheduleResult.data

  // Validación adicional de negocio (open requiere windows, start < end)
  for (const d of payload) {
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

  const rawObj = {
    ruleType: String(formData.get("ruleType") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: (() => {
      const v = formData.get("endDate")
      const s = v ? String(v).trim() : ""
      return s.length > 0 ? s : null
    })(),
    startTime: (() => {
      const v = formData.get("startTime")
      const s = v ? String(v).trim() : ""
      return s.length > 0 ? s : null
    })(),
    endTime: (() => {
      const v = formData.get("endTime")
      const s = v ? String(v).trim() : ""
      return s.length > 0 ? s : null
    })(),
    notes: (() => {
      const v = formData.get("notes")
      const s = v ? String(v).trim() : ""
      return s.length > 0 ? s : null
    })(),
  }

  const parseRes = dateRuleSchema.safeParse(rawObj)
  if (!parseRes.success) {
    const first = parseRes.error.issues[0]
    return { ok: false, error: first?.message ?? "Datos inválidos" }
  }
  const data = parseRes.data

  // Para date_open_override: requiere startTime y endTime
  if (data.ruleType === "date_open_override") {
    if (!data.startTime || !data.endTime) {
      return { ok: false, error: "Horario requerido para apertura excepcional" }
    }
    const start = asTimeOrNull(data.startTime)
    const end = asTimeOrNull(data.endTime)
    if (!start || !end) {
      return { ok: false, error: "Horario inválido" }
    }
    if (start >= end) {
      return { ok: false, error: "El inicio debe ser antes que el fin" }
    }
  }

  const startDate = data.startDate
  const endDate = data.endDate ?? null
  const startTime = data.startTime ? asTimeOrNull(data.startTime) : null
  const endTime = data.endTime ? asTimeOrNull(data.endTime) : null
  const notes = data.notes ?? null

  const defaultName =
    data.ruleType === "date_closed"
      ? `Cerrado ${startDate}${endDate && endDate !== startDate ? ` → ${endDate}` : ""}`
      : `Apertura ${startDate} ${startTime}–${endTime}`

  try {
    await availabilityRepo.upsertRule({
      studio_id: session.studioId,
      name: notes ?? defaultName,
      rule_type: data.ruleType,
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
        data.ruleType === "date_closed"
          ? `Fecha cerrada: ${startDate}${endDate ? ` → ${endDate}` : ""}`
          : `Apertura excepcional: ${startDate} ${startTime}–${endTime}`,
      metadata: { ruleType: data.ruleType, startDate, endDate },
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

  const parseRes = deleteIdSchema.safeParse({
    id: String(formData.get("id") ?? ""),
  })
  if (!parseRes.success) return
  const { id } = parseRes.data

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

  const rawObj = {
    startDate: String(formData.get("startDate") ?? ""),
    endDate: (() => {
      const v = formData.get("endDate")
      const s = v ? String(v).trim() : ""
      return s.length > 0 ? s : null
    })(),
    startTime: (() => {
      const v = formData.get("startTime")
      const s = v ? String(v).trim() : ""
      return s.length > 0 ? s : null
    })(),
    endTime: (() => {
      const v = formData.get("endTime")
      const s = v ? String(v).trim() : ""
      return s.length > 0 ? s : null
    })(),
    title: String(formData.get("title") ?? "").trim() || "Bloqueo",
    notes: (() => {
      const v = formData.get("notes")
      const s = v ? String(v).trim() : ""
      return s.length > 0 ? s : null
    })(),
    blockType:
      String(formData.get("blockType") ?? "manual") === "personal"
        ? ("personal" as const)
        : ("manual" as const),
  }

  const parseRes = manualBlockSchema.safeParse(rawObj)
  if (!parseRes.success) {
    const first = parseRes.error.issues[0]
    return { ok: false, error: first?.message ?? "Datos inválidos" }
  }
  const data = parseRes.data

  const startDate = data.startDate
  const finalEndDate = data.endDate ?? startDate
  const startTime = data.startTime ? asTimeOrNull(data.startTime) : null
  const endTime = data.endTime ? asTimeOrNull(data.endTime) : null

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
      block_type: data.blockType,
      title: data.title,
      notes: data.notes ?? null,
      is_confirmed: true,
      metadata: { created_by: session.userId },
    })

    await logActivity({
      studioId: session.studioId,
      action: "availability.block_created",
      entityType: "availability_block",
      actorId: session.userId,
      description: `Bloque manual: ${data.title}`,
      metadata: { startIso, endIso, blockType: data.blockType },
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

  const parseRes = deleteIdSchema.safeParse({
    id: String(formData.get("id") ?? ""),
  })
  if (!parseRes.success) return
  const { id } = parseRes.data

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
