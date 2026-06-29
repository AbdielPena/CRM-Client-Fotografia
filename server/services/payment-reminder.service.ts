import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { formatCurrency } from "@/lib/utils/currency"

/**
 * Recordatorio del saldo (50% restante) atado a la fecha de la SESIÓN:
 *  - "day_before": un día antes de la sesión.
 *  - "day_of": el día de la sesión (lo dispara el cron en la mañana, 8 AM RD).
 *
 * Por cada sesión con saldo pendiente: correo (marco luxury, plantilla
 * `session_balance_reminder`) + WhatsApp (Cloud API si está conectada; si no,
 * notificación al dueño con el link wa.me listo para enviar a mano).
 * Idempotente por (project_id, kind, event_date).
 */

const RD_TZ = "America/Santo_Domingo"
// Facturas que cuentan como "saldo pendiente".
const UNPAID_STATUSES = ["sent", "partially_paid", "overdue", "pending"]

function rdDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RD_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

type ProjRow = {
  id: string
  studio_id: string
  name: string
  event_date: string
  client_id: string | null
  currency: string | null
  client:
    | { name: string | null; email: string | null; phone: string | null }
    | { name: string | null; email: string | null; phone: string | null }[]
    | null
}

export type ReminderRunResult = {
  eligible: number
  emailed: number
  whatsappApi: number
  ownerNotified: number
  skipped: number
}

export async function runSessionPaymentReminders(): Promise<ReminderRunResult> {
  const sb = untypedService()
  const today = rdDate(0)
  const tomorrow = rdDate(1)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://my.abbypixel.com"

  const result: ReminderRunResult = {
    eligible: 0,
    emailed: 0,
    whatsappApi: 0,
    ownerNotified: 0,
    skipped: 0,
  }

  // 1) Sesiones de hoy / mañana
  const { data: projRows } = await sb
    .from("projects")
    .select(
      "id, studio_id, name, event_date, client_id, currency, client:clients(name,email,phone)",
    )
    .in("event_date", [today, tomorrow])
    .is("deleted_at", null)
  const projects = (projRows ?? []) as ProjRow[]
  if (projects.length === 0) return result
  const ids = projects.map((p) => p.id)

  // 2) Saldo pendiente por proyecto (suma de facturas no pagadas/canceladas)
  const { data: invRows } = await sb
    .from("invoices")
    .select("project_id, balance_due, status")
    .in("project_id", ids)
    .is("deleted_at", null)
  const balanceByProject = new Map<string, number>()
  for (const inv of (invRows ?? []) as Array<{
    project_id: string
    balance_due: number | string | null
    status: string
  }>) {
    if (!UNPAID_STATUSES.includes(inv.status)) continue
    const b = Number(inv.balance_due) || 0
    if (b <= 0) continue
    balanceByProject.set(inv.project_id, (balanceByProject.get(inv.project_id) ?? 0) + b)
  }

  // 3) Recordatorios ya enviados (idempotencia)
  const { data: sentRows } = await sb
    .from("session_payment_reminders")
    .select("project_id, kind, event_date")
    .in("project_id", ids)
  const sentSet = new Set(
    (sentRows ?? []).map(
      (r: { project_id: string; kind: string; event_date: string }) =>
        `${r.project_id}|${r.kind}|${r.event_date}`,
    ),
  )

  for (const p of projects) {
    const balance = balanceByProject.get(p.id) ?? 0
    if (balance <= 0) continue // sin saldo → no recordar
    result.eligible++

    const kind = p.event_date === today ? "day_of" : "day_before"
    if (sentSet.has(`${p.id}|${kind}|${p.event_date}`)) {
      result.skipped++
      continue
    }

    const client = Array.isArray(p.client) ? p.client[0] : p.client
    const whenLabel = kind === "day_of" ? "hoy" : "mañana"
    const amount = formatCurrency(balance, p.currency || "DOP")
    const dateLabel = new Intl.DateTimeFormat("es-DO", {
      timeZone: "UTC",
      day: "2-digit",
      month: "long",
    }).format(new Date(`${p.event_date}T00:00:00Z`))
    const portalUrl = `${appUrl}/portal/login`
    const firstName = (client?.name ?? "").trim().split(/\s+/)[0] || ""
    let emailed = false

    // ── Correo ──
    if (client?.email) {
      try {
        const { enqueueEmail } = await import("./email.service")
        const { resolveTemplate, TEMPLATE_CATALOG } = await import("./email-template.service")
        const defaults = TEMPLATE_CATALOG.session_balance_reminder
        const tpl = await resolveTemplate(
          p.studio_id,
          "session_balance_reminder",
          {
            client_name: firstName || client.name || "",
            session_name: p.name,
            when_label: whenLabel,
            session_date: dateLabel,
            balance_amount: amount,
            portal_url: portalUrl,
          },
          { subject: defaults.defaultSubject, bodyHtml: defaults.defaultBodyHtml },
        )
        await enqueueEmail({
          studioId: p.studio_id,
          toEmail: client.email,
          toName: client.name,
          subject: tpl.subject,
          bodyHtml: tpl.bodyHtml,
          fromName: tpl.fromName,
          replyTo: tpl.replyTo,
          templateSlug: "session_balance_reminder",
          relatedEntityType: "project",
          relatedEntityId: p.id,
        })
        emailed = true
        result.emailed++
      } catch (e) {
        console.error("[payment-reminder] email", e instanceof Error ? e.message : e)
      }
    }

    // ── WhatsApp ──
    let waSent = false
    let waLink: string | null = null
    if (client?.phone) {
      const digits = client.phone.replace(/\D/g, "")
      const msg = `¡Hola ${firstName}! 💛 Te recordamos que tu sesión "${p.name}" es ${whenLabel} (${dateLabel}). Queda pendiente el saldo de ${amount}. ¡Gracias!`
      waLink = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
      try {
        const { getWhatsAppStatus, sendTemplateMessage } = await import(
          "./whatsapp/cloud-api.service"
        )
        const status = await getWhatsAppStatus(p.studio_id)
        if (status.connected) {
          const r = await sendTemplateMessage(
            p.studio_id,
            client.phone,
            "recordatorio_saldo",
            "es",
            [firstName || "amig@"],
          )
          if (r.ok) {
            waSent = true
            result.whatsappApi++
          }
        }
      } catch {
        /* fallback wa.me en la notificación al dueño */
      }
    }

    // ── Notificación al dueño (puente para WhatsApp cuando la API no envió) ──
    try {
      await sb.from("notifications").insert({
        studio_id: p.studio_id,
        type: "payment_balance_reminder",
        title: `Saldo pendiente — ${client?.name ?? "cliente"} (sesión ${whenLabel})`,
        body: waSent
          ? `Recordatorio de saldo ${amount} enviado por correo y WhatsApp. Sesión ${dateLabel}.`
          : `Saldo pendiente ${amount} · sesión ${dateLabel}. ${emailed ? "Correo enviado. " : ""}${waLink ? `Enviar WhatsApp al cliente: ${waLink}` : "El cliente no tiene teléfono."}`,
        related_entity_type: "project",
        related_entity_id: p.id,
      })
      result.ownerNotified++
    } catch (e) {
      console.error("[payment-reminder] notif", e instanceof Error ? e.message : e)
    }

    // ── Marcar enviado ──
    await sb.from("session_payment_reminders").insert({
      studio_id: p.studio_id,
      project_id: p.id,
      kind,
      event_date: p.event_date,
      channels: [emailed ? "email" : null, waSent ? "whatsapp" : waLink ? "whatsapp_link" : null]
        .filter(Boolean)
        .join(","),
    })
  }

  return result
}
