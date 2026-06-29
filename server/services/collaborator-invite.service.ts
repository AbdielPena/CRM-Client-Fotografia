import "server-only"

import { randomBytes } from "node:crypto"

import { untypedService } from "@/server/supabase/untyped"
import { enqueueEmail } from "@/server/services/email.service"
import {
  resolveTemplate,
  type TemplateSlug,
} from "@/server/services/email-template.service"
import { collaboratorTypeLabel } from "@/lib/constants/collaborators"
import { formatCurrency } from "@/lib/utils/currency"

/**
 * Invitación por correo al colaborador + confirmación pública por token.
 * El correo pasa por el marco luxury (resolveTemplate + enqueueEmail). El
 * colaborador confirma/rechaza en /colab/<token> (sin login).
 */

function appUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://my.abbypixel.com").replace(
    /\/+$/,
    "",
  )
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Envía (o reenvía) la invitación. Best-effort; requiere email del colaborador. */
export async function sendCollaboratorInvite(
  studioId: string,
  assignmentId: string,
): Promise<{ ok: boolean; reason?: "not_found" | "no_email" }> {
  const sb = untypedService()
  const { data: aRow } = await sb
    .from("project_collaborators")
    .select(
      "id, role, agreed_pay, confirm_token, project_id, notes, collaborator:collaborators(name, email, type)",
    )
    .eq("id", assignmentId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  const a = aRow as any
  if (!a) return { ok: false, reason: "not_found" }
  const collab = Array.isArray(a.collaborator) ? a.collaborator[0] : a.collaborator
  if (!collab?.email) return { ok: false, reason: "no_email" }

  const { data: proj } = await sb
    .from("projects")
    .select("name, event_date, event_time, location, client_id")
    .eq("id", a.project_id)
    .maybeSingle()
  const p = proj as any
  let clientName = ""
  if (p?.client_id) {
    const { data: cl } = await sb
      .from("clients")
      .select("name")
      .eq("id", p.client_id)
      .maybeSingle()
    clientName = (cl as any)?.name ?? ""
  }
  const { data: studioRow } = await sb
    .from("studios")
    .select("name, email")
    .eq("id", studioId)
    .maybeSingle()
  const studio = studioRow as any
  const studioName = studio?.name ?? "El estudio"

  // Asegurar token de confirmación.
  let token = a.confirm_token as string | null
  if (!token) {
    token = randomBytes(24).toString("hex")
    await sb
      .from("project_collaborators")
      .update({ confirm_token: token })
      .eq("id", assignmentId)
  }
  const confirmUrl = `${appUrl()}/colab/${token}`

  const role = a.role || collaboratorTypeLabel(collab.type)
  const eventDate = p?.event_date
    ? new Date(p.event_date).toLocaleDateString("es-DO", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null
  const pay = Number(a.agreed_pay ?? 0)
  const detailRows = [
    ["Proyecto", p?.name],
    ["Cliente", clientName],
    ["Fecha", eventDate],
    ["Hora", p?.event_time],
    ["Lugar", p?.location],
    ["Rol", role],
    pay > 0 ? ["Pago acordado", formatCurrency(pay, "DOP")] : null,
  ]
    .filter((r): r is [string, string] => Array.isArray(r) && !!r[1])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#A1A1A6;font-size:13px">${esc(
          k,
        )}</td><td style="padding:4px 0;font-weight:600;font-size:13px">${esc(
          String(v),
        )}</td></tr>`,
    )
    .join("")

  const defaultHtml = `
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">Invitación</p>
  <h1>Te invitaron a colaborar</h1>
  <p>Hola <strong>{{collab_name}}</strong>, <strong>{{studio_name}}</strong> te invita a participar como colaborador/a en este trabajo:</p>
  <table style="margin:14px 0;border-collapse:collapse">{{details}}</table>
  ${a.notes ? `<p style="font-size:13.5px"><strong>Notas:</strong> ${esc(String(a.notes))}</p>` : ""}
  <p style="text-align:center;margin:28px 0 6px"><a class="btn" href="{{confirm_url}}">Confirmar mi asistencia</a></p>
  <p style="margin:8px 0 0;font-size:12.5px;color:#A1A1A6;text-align:center">Si no puedes asistir, también puedes indicarlo en ese mismo enlace.</p>`

  const resolved = await resolveTemplate(
    studioId,
    // slug nuevo (no en el catálogo del editor todavía): resolveTemplate cae al
    // default que pasamos abajo y lo envuelve en el marco luxury.
    "collaborator_invite" as TemplateSlug,
    {
      collab_name: esc(collab.name ?? ""),
      studio_name: esc(studioName),
      details: detailRows,
      confirm_url: confirmUrl,
    },
    {
      subject: `Invitación para colaborar — ${p?.name ?? studioName}`,
      bodyHtml: defaultHtml,
    },
  )

  await enqueueEmail({
    studioId,
    toEmail: collab.email,
    toName: collab.name ?? undefined,
    fromEmail: studio?.email ?? null,
    fromName: resolved.fromName ?? studioName,
    replyTo: resolved.replyTo ?? studio?.email ?? null,
    subject: resolved.subject,
    bodyHtml: resolved.bodyHtml,
    templateSlug: "collaborator_invite",
    relatedEntityType: "project_collaborator",
    relatedEntityId: assignmentId,
  })

  await sb
    .from("project_collaborators")
    .update({
      confirm_status: "invited",
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .neq("confirm_status", "confirmed")

  return { ok: true }
}

export type PublicInvite = {
  collaboratorName: string
  role: string
  agreedPay: number
  confirmStatus: string
  respondedAt: string | null
  studioName: string
  accent: string | null
  clientName: string
  project: {
    name: string | null
    eventDate: string | null
    eventTime: string | null
    location: string | null
  }
}

/** Datos para la página pública de confirmación (auth = el token). */
export async function getInviteByToken(token: string): Promise<PublicInvite | null> {
  if (!token || token.length < 16) return null
  const sb = untypedService()
  const { data: aRow } = await sb
    .from("project_collaborators")
    .select(
      "id, role, agreed_pay, confirm_status, responded_at, project_id, studio_id, collaborator:collaborators(name, type)",
    )
    .eq("confirm_token", token)
    .is("deleted_at", null)
    .maybeSingle()
  const a = aRow as any
  if (!a) return null
  const collab = Array.isArray(a.collaborator) ? a.collaborator[0] : a.collaborator

  const { data: proj } = await sb
    .from("projects")
    .select("name, event_date, event_time, location, client_id")
    .eq("id", a.project_id)
    .maybeSingle()
  const p = proj as any
  let clientName = ""
  if (p?.client_id) {
    const { data: cl } = await sb
      .from("clients")
      .select("name")
      .eq("id", p.client_id)
      .maybeSingle()
    clientName = (cl as any)?.name ?? ""
  }
  const { data: studioRow } = await sb
    .from("studios")
    .select("name, primary_color")
    .eq("id", a.studio_id)
    .maybeSingle()
  const studio = studioRow as any

  return {
    collaboratorName: collab?.name ?? "",
    role: a.role || collaboratorTypeLabel(collab?.type),
    agreedPay: Number(a.agreed_pay ?? 0),
    confirmStatus: a.confirm_status,
    respondedAt: a.responded_at,
    studioName: studio?.name ?? "El estudio",
    accent: studio?.primary_color ?? null,
    clientName,
    project: {
      name: p?.name ?? null,
      eventDate: p?.event_date ?? null,
      eventTime: p?.event_time ?? null,
      location: p?.location ?? null,
    },
  }
}

/** Confirma o rechaza la invitación (público, por token). */
export async function respondToInvite(
  token: string,
  action: "confirm" | "reject",
  note?: string | null,
): Promise<{ ok: boolean; status?: string; reason?: "not_found" }> {
  const sb = untypedService()
  const { data: aRow } = await sb
    .from("project_collaborators")
    .select("id, studio_id, project_id")
    .eq("confirm_token", token)
    .is("deleted_at", null)
    .maybeSingle()
  const a = aRow as any
  if (!a) return { ok: false, reason: "not_found" }
  const status = action === "confirm" ? "confirmed" : "rejected"
  await sb
    .from("project_collaborators")
    .update({
      confirm_status: status,
      responded_at: new Date().toISOString(),
      response_note: note ? note.slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", a.id)

  // Reflejar el estado en el evento de Google Calendar (best-effort).
  if (a.studio_id && a.project_id) {
    try {
      const { syncProjectById } = await import(
        "@/server/services/google-calendar.service"
      )
      void syncProjectById(a.studio_id, a.project_id).catch(() => {})
    } catch {
      /* sin integración → no-op */
    }
  }
  return { ok: true, status }
}
