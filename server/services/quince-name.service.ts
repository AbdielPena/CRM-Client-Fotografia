import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Captura pública del NOMBRE DE LA QUINCEAÑERA por token firmado (HMAC).
 *
 * Se le envía un correo al cliente de cada sesión de quinceañera que aún no
 * tiene `projects.quinceanera_name`, con un link `/q/[token]` donde lo registra
 * sin necesidad de login. El token es un HMAC firmado (no requiere tabla nueva)
 * que encapsula el projectId + expiración.
 */

const TTL_DAYS = 120

function getSecret(): string {
  const s =
    process.env["OAUTH_STATE_SECRET"] ??
    process.env["NEXTAUTH_SECRET"] ??
    "dev-portal-secret-change-me"
  if (s === "dev-portal-secret-change-me" && process.env.NODE_ENV === "production") {
    throw new Error("[quince-name] OAUTH_STATE_SECRET / NEXTAUTH_SECRET no configurado en producción")
  }
  return s
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url")
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://my.abbypixel.com"
  ).replace(/\/$/, "")
}

/** Firma un token para un proyecto (base64url(projectId.exp).sig). */
export function signQuinceToken(projectId: string): string {
  const exp = Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000
  const payload = `${projectId}.${exp}`
  const b64 = Buffer.from(payload).toString("base64url")
  return `${b64}.${sign(payload)}`
}

/** Verifica el token y devuelve el projectId, o null si es inválido/vencido. */
export function verifyQuinceToken(token: string): { projectId: string } | null {
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const b64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let payload: string
  try {
    payload = Buffer.from(b64, "base64url").toString("utf8")
  } catch {
    return null
  }
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const [projectId, expStr] = payload.split(".")
  const exp = Number(expStr)
  if (!projectId || !Number.isFinite(exp) || exp < Date.now()) return null
  return { projectId }
}

export function quinceNameUrl(projectId: string): string {
  return `${appUrl()}/q/${signQuinceToken(projectId)}`
}

const isQuince = (t: string | null | undefined) => /quince|xv/i.test(String(t ?? ""))

export type QuinceNameContext = {
  projectId: string
  sessionName: string
  currentName: string | null
  studioName: string
  studioLogo: string | null
  accent: string | null
}

/** Contexto para la página pública /q/[token]. */
export async function getQuinceNameContext(token: string): Promise<QuinceNameContext | null> {
  const v = verifyQuinceToken(token)
  if (!v) return null
  const sb = untypedService()
  const { data } = await sb
    .from("projects")
    .select("id, name, event_type, quinceanera_name, studio_id, deleted_at")
    .eq("id", v.projectId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = data as any
  if (!p || p.deleted_at) return null
  if (!isQuince(p.event_type)) return null

  const { data: studio } = await sb
    .from("studios")
    .select("name, logo_url, primary_color")
    .eq("id", p.studio_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = studio as any

  return {
    projectId: p.id,
    sessionName: p.name ?? "tu sesión",
    currentName: p.quinceanera_name ?? null,
    studioName: s?.name ?? "El estudio",
    studioLogo: s?.logo_url ?? null,
    accent: s?.primary_color ?? null,
  }
}

/** Guarda el nombre desde la página pública (valida el token). */
export async function submitQuinceName(
  token: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const v = verifyQuinceToken(token)
  if (!v) return { ok: false, error: "El enlace no es válido o venció." }
  const clean = (name ?? "").trim().slice(0, 120)
  if (clean.length < 2) return { ok: false, error: "Escribe el nombre completo." }

  const sb = untypedService()
  // Confirmar que es una sesión de quinceañera válida antes de escribir.
  const { data } = await sb
    .from("projects")
    .select("id, event_type, studio_id, deleted_at")
    .eq("id", v.projectId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = data as any
  if (!p || p.deleted_at || !isQuince(p.event_type)) {
    return { ok: false, error: "No encontramos la sesión." }
  }

  const { error } = await sb
    .from("projects")
    .update({ quinceanera_name: clean, updated_at: new Date().toISOString() })
    .eq("id", v.projectId)
  if (error) return { ok: false, error: "No se pudo guardar. Intenta de nuevo." }
  return { ok: true }
}

export type MissingQuinceRow = {
  projectId: string
  projectName: string
  clientName: string
  clientEmail: string
}

/** Sesiones de quinceañera del estudio sin nombre registrado y con email de cliente. */
export async function listProjectsMissingQuinceName(
  studioId: string,
): Promise<MissingQuinceRow[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("projects")
    .select("id, name, event_type, quinceanera_name, client:clients(name, email)")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  const pickOne = (x: unknown) => (Array.isArray(x) ? x[0] : x)
  const out: MissingQuinceRow[] = []
  for (const r of rows) {
    if (!isQuince(r.event_type)) continue
    if (String(r.quinceanera_name ?? "").trim()) continue
    const c = pickOne(r.client) as { name?: string; email?: string } | null
    const email = (c?.email ?? "").trim()
    if (!email) continue
    out.push({
      projectId: r.id,
      projectName: r.name ?? "Sesión",
      clientName: c?.name ?? "",
      clientEmail: email,
    })
  }
  return out
}

/** Envía (encola) el correo con el link a cada cliente sin nombre registrado. */
export async function sendQuinceNameRequests(
  studioId: string,
): Promise<{ sent: number; total: number }> {
  const rows = await listProjectsMissingQuinceName(studioId)
  if (rows.length === 0) return { sent: 0, total: 0 }

  const { enqueueEmail } = await import("./email.service")
  const { resolveTemplate, TEMPLATE_CATALOG } = await import("./email-template.service")
  const d = TEMPLATE_CATALOG.quince_name_request

  let sent = 0
  for (const r of rows) {
    try {
      const firstName = (r.clientName || "").split(" ")[0] || r.clientName
      const tpl = await resolveTemplate(
        studioId,
        "quince_name_request",
        {
          client_name: firstName,
          session_name: r.projectName,
          link: quinceNameUrl(r.projectId),
        },
        { subject: d.defaultSubject, bodyHtml: d.defaultBodyHtml },
      )
      await enqueueEmail({
        studioId,
        toEmail: r.clientEmail,
        toName: r.clientName || undefined,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        fromName: tpl.fromName,
        replyTo: tpl.replyTo,
        templateSlug: "quince_name_request",
        relatedEntityType: "project",
        relatedEntityId: r.projectId,
      })
      sent++
    } catch (e) {
      console.error("[quince-name] email falló", r.projectId, e instanceof Error ? e.message : e)
    }
  }
  return { sent, total: rows.length }
}
