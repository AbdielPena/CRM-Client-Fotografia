import "server-only"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Cambio MANUAL de la hora de una sesión, con motivo. Al cambiarla:
 *  1. Actualiza `projects.event_time` (vía updateProject → re-sync a Google
 *     Calendar con la hora real, ya no como evento de día completo).
 *  2. Registra el cambio en `session_time_changes` (historial + motivo).
 *  3. Avisa al cliente por **correo** (plantilla `session_time_changed`) y
 *     **WhatsApp** (Cloud API si está conectada; si no, link wa.me en la
 *     notificación al dueño). Mismo patrón que [[recordatorio de saldo]].
 */

function fmtTime12(hms: string | null): string {
  if (!hms) return "—"
  const [hStr, mStr] = String(hms).split(":")
  const h = Number(hStr)
  const m = Number(mStr ?? "0")
  if (Number.isNaN(h)) return String(hms)
  const period = h >= 12 ? "p. m." : "a. m."
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

function fmtDateLong(dateOnly: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${dateOnly.slice(0, 10)}T00:00:00Z`))
}

export type ChangeTimeResult = {
  ok: boolean
  oldTime: string | null
  newTime: string
  emailed: boolean
  whatsappApi: boolean
  ownerNotified: boolean
  waLink: string | null
}

type ClientRel = { name: string | null; email: string | null; phone: string | null }

export async function changeSessionTime(
  studioId: string,
  actorId: string,
  projectId: string,
  newTime: string,
  reason: string,
): Promise<ChangeTimeResult> {
  const sb = untypedService()
  const norm = (newTime || "").trim().slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(norm)) throw new Error("Hora inválida (usa HH:mm)")
  if (!reason.trim()) throw new Error("Indica el motivo del cambio de hora")

  const { data: proj } = await sb
    .from("projects")
    .select(
      "id, studio_id, name, event_date, event_time, client:clients(name,email,phone)",
    )
    .eq("id", projectId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!proj) throw new Error("PROJECT_NOT_FOUND")
  const p = proj as {
    id: string
    name: string
    event_date: string | null
    event_time: string | null
    client: ClientRel | ClientRel[] | null
  }

  const oldTime = p.event_time ? String(p.event_time).slice(0, 5) : null
  if (oldTime === norm) {
    return {
      ok: false,
      oldTime,
      newTime: norm,
      emailed: false,
      whatsappApi: false,
      ownerNotified: false,
      waLink: null,
    }
  }

  // 1) Actualizar la hora → re-sync a Google Calendar (updateProject lo dispara).
  const { updateProject } = await import("./project.service")
  await updateProject(studioId, actorId, projectId, { eventTime: norm })

  // 2) Historial del cambio.
  await sb.from("session_time_changes").insert({
    studio_id: studioId,
    project_id: projectId,
    old_time: oldTime,
    new_time: norm,
    reason: reason.trim(),
    changed_by: actorId,
  })

  const client = Array.isArray(p.client) ? p.client[0] : p.client
  const firstName = (client?.name ?? "").trim().split(/\s+/)[0] || ""
  const dateLabel = p.event_date ? fmtDateLong(p.event_date) : ""
  const oldLabel = fmtTime12(oldTime)
  const newLabel = fmtTime12(norm)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://my.abbypixel.com"
  const portalUrl = `${appUrl}/portal/login`

  let emailed = false
  let whatsappApi = false
  let ownerNotified = false
  let waLink: string | null = null

  // 3) Correo al cliente.
  if (client?.email) {
    try {
      const { enqueueEmail } = await import("./email.service")
      const { resolveTemplate, TEMPLATE_CATALOG } = await import("./email-template.service")
      const d = TEMPLATE_CATALOG.session_time_changed
      const tpl = await resolveTemplate(
        studioId,
        "session_time_changed",
        {
          client_name: firstName || client.name || "",
          session_name: p.name,
          session_date: dateLabel,
          old_time: oldLabel,
          new_time: newLabel,
          reason: reason.trim(),
          portal_url: portalUrl,
        },
        { subject: d.defaultSubject, bodyHtml: d.defaultBodyHtml },
      )
      await enqueueEmail({
        studioId,
        toEmail: client.email,
        toName: client.name,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        fromName: tpl.fromName,
        replyTo: tpl.replyTo,
        templateSlug: "session_time_changed",
        relatedEntityType: "project",
        relatedEntityId: projectId,
      })
      emailed = true
    } catch (e) {
      console.error("[change-time] email", e instanceof Error ? e.message : e)
    }
  }

  // 4) WhatsApp (Cloud API si conectada; si no, link wa.me en la notif al dueño).
  const waMsg = `¡Hola ${firstName}! 💛 La hora de tu sesión "${p.name}"${
    dateLabel ? ` (${dateLabel})` : ""
  } cambió: de ${oldLabel} a ${newLabel}. Motivo: ${reason.trim()}.`
  if (client?.phone) {
    const digits = client.phone.replace(/\D/g, "")
    waLink = `https://wa.me/${digits}?text=${encodeURIComponent(waMsg)}`
    try {
      const { getWhatsAppStatus, sendTemplateMessage } = await import(
        "./whatsapp/cloud-api.service"
      )
      const status = await getWhatsAppStatus(studioId)
      if (status.connected) {
        const r = await sendTemplateMessage(
          studioId,
          client.phone,
          "cambio_hora_sesion",
          "es",
          [firstName || "amig@", newLabel],
        )
        if (r.ok) whatsappApi = true
      }
    } catch {
      /* fallback wa.me en la notificación al dueño */
    }
  }

  // 5) Notificación al dueño (puente WhatsApp cuando la API no envió).
  try {
    await sb.from("notifications").insert({
      studio_id: studioId,
      type: "session_time_changed",
      title: `Hora cambiada — ${client?.name ?? "cliente"}: ${oldLabel} → ${newLabel}`,
      body: whatsappApi
        ? `Aviso de cambio de hora enviado por correo y WhatsApp. ${p.name}${
            dateLabel ? ` (${dateLabel})` : ""
          }. Motivo: ${reason.trim()}.`
        : `${p.name}${dateLabel ? ` (${dateLabel})` : ""}: ${oldLabel} → ${newLabel}. ${
            emailed ? "Correo enviado. " : ""
          }${waLink ? `Enviar WhatsApp al cliente: ${waLink}` : "El cliente no tiene teléfono."} Motivo: ${reason.trim()}.`,
      related_entity_type: "project",
      related_entity_id: projectId,
    })
    ownerNotified = true
  } catch (e) {
    console.error("[change-time] notif", e instanceof Error ? e.message : e)
  }

  return { ok: true, oldTime, newTime: norm, emailed, whatsappApi, ownerNotified, waLink }
}

/**
 * Avisa al cliente que la FECHA y/o la HORA de su sesión cambió.
 *
 * A diferencia de `changeSessionTime` (que solo cubre la hora y se dispara con
 * el botón "Cambiar hora"), esta se llama desde `updateProject` cuando el
 * fotógrafo edita la sesión y toca `event_date` / `event_time`. El evento de
 * Google ya se re-sincroniza solo en `updateProject`; esto añade el aviso al
 * cliente por correo + WhatsApp, que antes no se enviaba.
 *
 * Best-effort: nunca rompe el guardado de la sesión.
 */
export async function notifyScheduleChange(
  studioId: string,
  projectId: string,
  prev: { date: string | null; time: string | null },
  next: { date: string | null; time: string | null },
  reason = "",
): Promise<{ emailed: boolean; whatsappApi: boolean; waLink: string | null }> {
  const out = { emailed: false, whatsappApi: false, waLink: null as string | null }
  const sb = untypedService()
  const { data } = await sb
    .from("projects")
    .select("id, name, client:clients(name,email,phone)")
    .eq("id", projectId)
    .eq("studio_id", studioId)
    .maybeSingle()
  const p = data as { name?: string; client?: unknown } | null
  if (!p) return out
  const client = (Array.isArray(p.client) ? p.client[0] : p.client) as
    | { name?: string; email?: string; phone?: string }
    | null
  const firstName = (client?.name ?? "").trim().split(/\s+/)[0] || ""
  const dateChanged = (prev.date ?? "") !== (next.date ?? "")
  const timeChanged = (prev.time ?? "") !== (next.time ?? "")
  if (!dateChanged && !timeChanged) return out

  const newDateLabel = next.date ? fmtDateLong(next.date) : ""
  const oldDateLabel = prev.date ? fmtDateLong(prev.date) : ""
  const oldTimeLabel = prev.time ? fmtTime12(String(prev.time).slice(0, 5)) : ""
  const newTimeLabel = next.time ? fmtTime12(String(next.time).slice(0, 5)) : ""
  // Si cambió la fecha, se antepone al motivo para que el cliente lo vea claro.
  const detail = dateChanged
    ? `La fecha pasó de ${oldDateLabel} a ${newDateLabel}.${reason ? " " + reason : ""}`
    : reason
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://my.abbypixel.com"

  if (client?.email) {
    try {
      const { enqueueEmail } = await import("./email.service")
      const { resolveTemplate, TEMPLATE_CATALOG } = await import("./email-template.service")
      const d = TEMPLATE_CATALOG.session_time_changed
      const tpl = await resolveTemplate(
        studioId,
        "session_time_changed",
        {
          client_name: firstName || client.name || "",
          session_name: p.name ?? "",
          session_date: newDateLabel,
          old_time: oldTimeLabel || oldDateLabel,
          new_time: newTimeLabel || newDateLabel,
          reason: detail,
          portal_url: `${appUrl}/portal/login`,
        },
        { subject: d.defaultSubject, bodyHtml: d.defaultBodyHtml },
      )
      await enqueueEmail({
        studioId,
        toEmail: client.email,
        toName: client.name,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        fromName: tpl.fromName,
        replyTo: tpl.replyTo,
        templateSlug: "session_time_changed",
        relatedEntityType: "project",
        relatedEntityId: projectId,
      })
      out.emailed = true
    } catch (e) {
      console.error("[schedule-change] email", e instanceof Error ? e.message : e)
    }
  }

  const msg =
    `Hola ${firstName}, te confirmamos un cambio en tu sesión: ` +
    (dateChanged ? `nueva fecha ${newDateLabel}` : `nueva hora ${newTimeLabel}`) +
    (dateChanged && newTimeLabel ? ` a las ${newTimeLabel}` : "") +
    `. ${reason} — AbbyPixel`
  if (client?.phone) {
    try {
      const { getWhatsAppStatus, sendTextMessage } = await import(
        "./whatsapp/cloud-api.service"
      )
      const status = await getWhatsAppStatus(studioId)
      if (status.connected) {
        const r = await sendTextMessage(studioId, client.phone, msg)
        if (r.ok) out.whatsappApi = true
      }
    } catch (e) {
      console.error("[schedule-change] whatsapp", e instanceof Error ? e.message : e)
    }
    if (!out.whatsappApi) {
      const digits = String(client.phone).replace(/\D/g, "")
      out.waLink = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
    }
  }
  return out
}
