import { NextResponse, type NextRequest } from "next/server"
import { randomBytes } from "node:crypto"

import { untypedService } from "@/server/supabase/untyped"
import { sendClientPortalAccessEmail } from "@/server/services/client-portal-email.service"
import { safeEqual } from "@/lib/utils/timing-safe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/internal/v1/migrate-clients
 *
 * Alta por lote de clientes migrados (p.ej. desde Pixieset) con su plan como
 * sesión, usando el service-role (bypasea RLS — los services normales exigen
 * sesión de dueño). Idempotente: dedup de cliente por email y de proyecto por
 * (client_id, package_id). Opcionalmente envía el correo real del portal
 * (`sendClientPortalAccessEmail` → plantilla luxury vía resolveTemplate).
 *
 * Auth: cabecera `x-internal-key` (o Bearer) == INTERNAL_API_KEY. Vive bajo
 * /api/internal (exenta del middleware de sesión); autoriza este handler.
 *
 * Body:
 *   {
 *     studioId: string,
 *     sendEmail?: boolean,   // default true
 *     dryRun?: boolean,      // solo reporta qué haría, sin escribir
 *     clients: Array<{
 *       name, email?, phone?, address?, city?, country?, notes?,
 *       packageId?, eventType?, projectName?, status?
 *     }>
 *   }
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
function genAccessCode(len = 8): string {
  const bytes = randomBytes(len)
  let out = ""
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!
  return out
}

const APP_URL = (
  process.env["NEXT_PUBLIC_APP_URL"] ?? "https://my.abbypixel.com"
).replace(/\/+$/, "")

type InClient = {
  name?: string
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  notes?: string | null
  packageId?: string | null
  eventType?: string | null
  projectName?: string | null
  status?: string | null
}

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
    sendEmail?: boolean
    dryRun?: boolean
    clients?: InClient[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const studioId = body.studioId
  const clients = Array.isArray(body.clients) ? body.clients : []
  if (!studioId || clients.length === 0) {
    return NextResponse.json({ error: "faltan studioId / clients" }, { status: 400 })
  }
  const sendEmail = body.sendEmail !== false // default true
  const dryRun = body.dryRun === true

  const sb = untypedService()
  const results: Record<string, unknown>[] = []

  for (const c of clients) {
    const name = (c.name ?? "").trim()
    if (!name) {
      results.push({ name: c.name ?? null, error: "name requerido" })
      continue
    }
    const emailLc = c.email ? c.email.trim().toLowerCase() : null

    try {
      // 1) Dedup de cliente por email.
      let clientId: string | null = null
      let existed = false
      let accessCode: string | null = null
      if (emailLc) {
        const { data: ex } = await sb
          .from("clients")
          .select("id, access_code")
          .eq("studio_id", studioId)
          .ilike("email", emailLc)
          .is("deleted_at", null)
          .maybeSingle()
        if (ex) {
          clientId = (ex as { id: string }).id
          existed = true
          accessCode = (ex as { access_code: string | null }).access_code ?? null
        }
      }

      if (dryRun) {
        results.push({
          name,
          email: emailLc,
          wouldCreateClient: !existed,
          existed,
          packageId: c.packageId ?? null,
        })
        continue
      }

      // 2) Crear cliente si no existe.
      if (!clientId) {
        accessCode = genAccessCode()
        const { data: created, error: cerr } = await sb
          .from("clients")
          .insert({
            studio_id: studioId,
            name,
            email: emailLc,
            phone: c.phone ?? null,
            source: "other",
            notes: c.notes ?? null,
            address: c.address ?? null,
            city: c.city ?? null,
            country: c.country ?? null,
            access_code: accessCode,
          })
          .select("id")
          .single()
        if (cerr) {
          results.push({ name, error: `client insert: ${cerr.message}` })
          continue
        }
        clientId = (created as { id: string }).id
      } else if (!accessCode) {
        accessCode = genAccessCode()
        await sb.from("clients").update({ access_code: accessCode }).eq("id", clientId)
      }

      // 3) Proyecto con el plan (dedup por client_id + package_id).
      let projectId: string | null = null
      let projectExisted = false
      if (c.packageId) {
        const { data: existingProj } = await sb
          .from("projects")
          .select("id")
          .eq("studio_id", studioId)
          .eq("client_id", clientId)
          .eq("package_id", c.packageId)
          .is("deleted_at", null)
          .maybeSingle()
        if (existingProj) {
          projectId = (existingProj as { id: string }).id
          projectExisted = true
        } else {
          const { data: proj, error: perr } = await sb
            .from("projects")
            .insert({
              studio_id: studioId,
              client_id: clientId,
              package_id: c.packageId,
              name: c.projectName || name,
              event_type: c.eventType || "quinceañera",
              status: c.status || "Consulta inicial",
              currency: "DOP",
              service_category_id: null, // el trigger la hereda del paquete
            })
            .select("id")
            .single()
          if (perr) {
            results.push({ name, clientId, warn: `project insert: ${perr.message}` })
          } else {
            projectId = (proj as { id: string }).id
          }
        }
      }

      // 4) Correo real del portal (opcional).
      let emailQueued = false
      if (sendEmail && emailLc && accessCode && clientId) {
        try {
          await sendClientPortalAccessEmail({
            studioId,
            clientId,
            clientName: name,
            clientEmail: emailLc,
            accessCode,
          })
          emailQueued = true
        } catch (e) {
          results.push({ name, emailError: e instanceof Error ? e.message : String(e) })
        }
      }

      const portalLink =
        emailLc && accessCode
          ? `${APP_URL}/portal/login?email=${encodeURIComponent(emailLc)}&code=${encodeURIComponent(accessCode)}`
          : null

      results.push({
        name,
        clientId,
        projectId,
        existed,
        projectExisted,
        emailQueued,
        portalLink,
      })
    } catch (e) {
      results.push({ name, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results })
}
