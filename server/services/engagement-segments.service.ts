import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { enqueueEmail } from "@/server/services/email.service"
import { SEGMENT_LIST, SEGMENT_DEFAULTS } from "@/lib/engagement/segments"

/**
 * Segmentación (Fase 1.5): calcula segmentos al vuelo y permite enviar campañas
 * de email a un segmento completo. Reusa la cola de email existente.
 */

function renderVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "")
}

function birthdayMonthDay(s: string | null): { m: number; d: number } | null {
  if (!s) return null
  const t = s.trim()
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return { m: +m[2], d: +m[3] }
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) return { m: +m[2], d: +m[1] }
  m = t.match(/^(\d{1,2})[-/](\d{1,2})$/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    return a > 12 ? { m: b, d: a } : { m: a, d: b }
  }
  const dt = new Date(t)
  if (!isNaN(dt.getTime())) return { m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
  return null
}

async function projectClientIds(studioId: string, eventTypes: string[]): Promise<string[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("projects")
    .select("client_id")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .in("event_type", eventTypes)
    .not("client_id", "is", null)
  const set = new Set<string>()
  for (const r of (data ?? []) as Array<{ client_id: string }>) set.add(r.client_id)
  return [...set]
}

/** IDs de clientes ACTIVOS (no borrados) que pertenecen a un segmento. */
export async function getSegmentClientIds(studioId: string, segmentKey: string): Promise<string[]> {
  const sb = untypedService()

  // Conjunto de clientes válidos (no borrados) para intersectar.
  const { data: validRaw } = await sb
    .from("clients")
    .select("id, created_at, birthday")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
  const valid = (validRaw ?? []) as Array<{ id: string; created_at: string; birthday: string | null }>
  const validIds = new Set(valid.map((c) => c.id))
  const filt = (ids: string[]) => ids.filter((id) => validIds.has(id))

  switch (segmentKey) {
    case "quinceaneras":
      return filt(await projectClientIds(studioId, ["quinceañera", "quinceanera"]))
    case "bodas":
      return filt(await projectClientIds(studioId, ["wedding", "boda"]))
    case "eventos":
      return filt(await projectClientIds(studioId, ["event", "evento"]))
    case "vip": {
      const { data } = await sb
        .from("payments")
        .select("client_id, amount")
        .eq("studio_id", studioId)
        .is("deleted_at", null)
        .not("client_id", "is", null)
      const sums: Record<string, number> = {}
      for (const p of (data ?? []) as Array<{ client_id: string; amount: number | string }>) {
        sums[p.client_id] = (sums[p.client_id] ?? 0) + Number(p.amount ?? 0)
      }
      return filt(
        Object.entries(sums)
          .filter(([, v]) => v >= SEGMENT_DEFAULTS.vipMinPaid)
          .map(([k]) => k),
      )
    }
    case "antiguos": {
      const cutoff = new Date()
      cutoff.setUTCMonth(cutoff.getUTCMonth() - SEGMENT_DEFAULTS.oldClientMonths)
      return valid.filter((c) => new Date(c.created_at).getTime() <= cutoff.getTime()).map((c) => c.id)
    }
    case "inactive_6m": {
      const cutoff = new Date()
      cutoff.setUTCMonth(cutoff.getUTCMonth() - SEGMENT_DEFAULTS.inactiveMonths)
      // Última actividad = max(projects.created_at) por cliente.
      const { data: projs } = await sb
        .from("projects")
        .select("client_id, created_at")
        .eq("studio_id", studioId)
        .is("deleted_at", null)
        .not("client_id", "is", null)
      const last: Record<string, string> = {}
      for (const p of (projs ?? []) as Array<{ client_id: string; created_at: string }>) {
        if (!last[p.client_id] || p.created_at > last[p.client_id]) last[p.client_id] = p.created_at
      }
      return valid
        .filter((c) => {
          const l = last[c.id] ?? c.created_at
          return new Date(l).getTime() <= cutoff.getTime()
        })
        .map((c) => c.id)
    }
    case "birthday_soon": {
      const now = new Date()
      const targets = new Set<string>()
      for (let i = 0; i <= SEGMENT_DEFAULTS.birthdayWindowDays; i++) {
        const d = new Date(now)
        d.setUTCDate(d.getUTCDate() + i)
        targets.add(`${d.getUTCMonth() + 1}-${d.getUTCDate()}`)
      }
      return valid
        .filter((c) => {
          const md = birthdayMonthDay(c.birthday)
          return md ? targets.has(`${md.m}-${md.d}`) : false
        })
        .map((c) => c.id)
    }
    default:
      return []
  }
}

/** Conteo de clientes por segmento (para el dashboard de segmentos). */
export async function getSegmentCounts(studioId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const s of SEGMENT_LIST) {
    try {
      out[s.key] = (await getSegmentClientIds(studioId, s.key)).length
    } catch {
      out[s.key] = 0
    }
  }
  return out
}

/** Envía una campaña de email a todos los clientes (con email) de un segmento. */
export async function sendSegmentCampaign(
  studioId: string,
  segmentKey: string,
  input: { subject: string; bodyHtml: string },
): Promise<{ sent: number; total: number }> {
  const sb = untypedService()
  const ids = await getSegmentClientIds(studioId, segmentKey)
  if (ids.length === 0) return { sent: 0, total: 0 }

  const { data: studioRow } = await sb.from("studios").select("name, email").eq("id", studioId).maybeSingle()
  const studio = studioRow as { name?: string; email?: string } | null
  const studioName = studio?.name ?? "Tu fotógrafo"

  const { data: clientsRaw } = await sb
    .from("clients")
    .select("id, name, email")
    .in("id", ids)
  const clients = ((clientsRaw ?? []) as Array<{ id: string; name: string | null; email: string | null }>).filter(
    (c) => !!c.email,
  )

  let sent = 0
  for (const c of clients) {
    const vars = { client_name: c.name ?? "", studio_name: studioName }
    try {
      await enqueueEmail({
        studioId,
        toEmail: c.email as string,
        toName: c.name ?? undefined,
        fromEmail: studio?.email ?? null,
        fromName: studioName,
        subject: renderVars(input.subject, vars),
        bodyHtml: renderVars(input.bodyHtml, vars),
        relatedEntityType: "client",
        relatedEntityId: c.id,
      })
      sent++
    } catch (e) {
      console.error("[engagement-segments] enqueue fail", c.id, e)
    }
  }
  return { sent, total: clients.length }
}
