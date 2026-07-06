import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"
import {
  enqueueEmail,
  renderFormInvitationForClient,
} from "@/server/services/email.service"
import { getEmailBranding } from "@/server/services/email-template.service"
import { safeEqual } from "@/lib/utils/timing-safe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/internal/v1/attach-questionnaire
 *
 * Adjunta el cuestionario (form_response) del paquete a la sesión de cada
 * cliente migrado y, opcionalmente, envía el correo real "completa tu
 * información" (renderFormInvitationForClient) con el link /f/[token].
 * Idempotente: no duplica el form_response por (project_id, form_template_id).
 * Permite `extraFields` por item (se anexan al schema_snapshot de ESE cliente
 * — p.ej. campos de una cotización modificada — sin tocar la plantilla).
 *
 * Auth: `x-internal-key` (o Bearer) == INTERNAL_API_KEY.
 *
 * Body: {
 *   studioId, appBaseUrl?, sendEmail?, dryRun?,
 *   items: Array<{ clientEmail, extraFields?: Array<Record<string,unknown>> }>
 * }
 */

type ExtraField = Record<string, unknown>
type InItem = { clientEmail?: string; extraFields?: ExtraField[] }

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_API_KEY no configurado" }, { status: 500 })
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    studioId?: string
    appBaseUrl?: string
    sendEmail?: boolean
    dryRun?: boolean
    items?: InItem[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const studioId = body.studioId
  const items = Array.isArray(body.items) ? body.items : []
  if (!studioId || items.length === 0) {
    return NextResponse.json({ error: "faltan studioId / items" }, { status: 400 })
  }
  const appBaseUrl = (body.appBaseUrl ?? "https://my.abbypixel.com").replace(/\/+$/, "")
  const sendEmail = body.sendEmail !== false
  const dryRun = body.dryRun === true

  const sb = untypedService()

  // Studio (para el correo).
  const { data: studio } = await sb
    .from("studios")
    .select("name, email, primary_color")
    .eq("id", studioId)
    .maybeSingle()
  if (!studio) {
    return NextResponse.json({ error: "studio no encontrado" }, { status: 404 })
  }
  const branding = sendEmail ? await getEmailBranding(studioId) : null

  const results: Record<string, unknown>[] = []

  for (const item of items) {
    const emailLc = item.clientEmail ? item.clientEmail.trim().toLowerCase() : null
    if (!emailLc) {
      results.push({ clientEmail: item.clientEmail ?? null, error: "clientEmail requerido" })
      continue
    }

    try {
      // 1) Cliente.
      const { data: client } = await sb
        .from("clients")
        .select("id, name, email")
        .eq("studio_id", studioId)
        .ilike("email", emailLc)
        .is("deleted_at", null)
        .maybeSingle()
      if (!client) {
        results.push({ clientEmail: emailLc, error: "cliente no encontrado" })
        continue
      }

      // 2) Su sesión (proyecto) más reciente con paquete.
      const { data: project } = await sb
        .from("projects")
        .select("id, package_id")
        .eq("studio_id", studioId)
        .eq("client_id", client.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!project) {
        results.push({ clientEmail: emailLc, error: "el cliente no tiene sesión" })
        continue
      }

      // 3) Plantilla del cuestionario (default del paquete).
      let templateId: string | null = null
      if (project.package_id) {
        const { data: pkg } = await sb
          .from("packages")
          .select("default_form_template_id")
          .eq("id", project.package_id)
          .maybeSingle()
        templateId = pkg?.default_form_template_id ?? null
      }
      if (!templateId) {
        results.push({ clientEmail: emailLc, error: "el paquete no tiene cuestionario por defecto" })
        continue
      }
      const { data: tpl } = await sb
        .from("form_templates")
        .select("id, name, schema, is_active, deleted_at")
        .eq("id", templateId)
        .eq("studio_id", studioId)
        .maybeSingle()
      if (!tpl || !tpl.is_active || tpl.deleted_at) {
        results.push({ clientEmail: emailLc, error: "cuestionario inactivo o inexistente" })
        continue
      }

      // 4) Dedup por (project, template).
      const { data: existing } = await sb
        .from("form_responses")
        .select("id, access_token")
        .eq("studio_id", studioId)
        .eq("project_id", project.id)
        .eq("form_template_id", templateId)
        .is("deleted_at", null)
        .maybeSingle()

      // 5) schema_snapshot (+ campos extra opcionales de este cliente).
      const schema = JSON.parse(JSON.stringify(tpl.schema ?? { fields: [] })) as {
        fields?: ExtraField[]
      }
      if (Array.isArray(item.extraFields) && item.extraFields.length > 0) {
        schema.fields = [...(schema.fields ?? []), ...item.extraFields]
      }

      if (dryRun) {
        results.push({
          clientEmail: emailLc,
          name: client.name,
          projectId: project.id,
          templateId,
          existed: !!existing,
          extraFields: item.extraFields?.length ?? 0,
        })
        continue
      }

      // 6) Crear form_response (o reusar).
      let responseId: string
      let accessToken: string
      let existed = false
      if (existing) {
        responseId = existing.id
        accessToken = existing.access_token
        existed = true
      } else {
        const { data: created, error: cerr } = await sb
          .from("form_responses")
          .insert({
            studio_id: studioId,
            form_template_id: templateId,
            project_id: project.id,
            client_email: emailLc,
            status: "sent",
            data: {},
            schema_snapshot: schema,
            sent_at: new Date().toISOString(),
          })
          .select("id, access_token")
          .single()
        if (cerr) {
          results.push({ clientEmail: emailLc, error: `form_response insert: ${cerr.message}` })
          continue
        }
        responseId = created.id
        accessToken = created.access_token
      }

      const formUrl = `${appBaseUrl}/f/${accessToken}`

      // 7) Correo "completa tu información" (opcional), con nombre correcto.
      let emailQueued = false
      if (sendEmail) {
        try {
          const { subject, html } = renderFormInvitationForClient({
            studioName: studio.name,
            primaryColor: studio.primary_color ?? "#111827",
            branding: branding!,
            clientName: client.name,
            formTitle: tpl.name,
            formUrl,
            replyToEmail: studio.email,
          })
          await enqueueEmail({
            studioId,
            toEmail: emailLc,
            toName: client.name,
            subject,
            bodyHtml: html,
            replyTo: studio.email,
            templateSlug: "form_invitation",
            relatedEntityType: "form_response",
            relatedEntityId: responseId,
            metadata: { template: tpl.name, formUrl },
          })
          emailQueued = true
        } catch (e) {
          results.push({ clientEmail: emailLc, formLink: formUrl, emailError: e instanceof Error ? e.message : String(e) })
        }
      }

      results.push({
        clientEmail: emailLc,
        name: client.name,
        projectId: project.id,
        formResponseId: responseId,
        existed,
        emailQueued,
        formLink: formUrl,
      })
    } catch (e) {
      results.push({ clientEmail: emailLc, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results })
}
