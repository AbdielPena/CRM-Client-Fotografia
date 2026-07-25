import "server-only"

import { randomBytes } from "node:crypto"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Cotizaciones manuales — las que Abdiel cierra por WhatsApp.
 *
 * PROBLEMA: la única puerta al flujo completo (cliente → contrato → firma →
 * factura → pago → portal) era el formulario público que llena el cliente. Los
 * tratos cerrados por WhatsApp no tenían por dónde entrar.
 *
 * SOLUCIÓN (sin duplicar nada): una cotización ES una `booking_requests` en
 * estado `quoted` con un token propio. El correo lleva al cliente al MISMO
 * formulario público de siempre —con sus datos prellenados y el precio
 * acordado a la vista—. Al enviarlo, la solicitud pasa a revisión y se aprueba
 * SOLA (Abdiel ya dijo que sí al cotizar), disparando la cadena que ya existe y
 * que lleva 27 reservas procesadas.
 *
 * El precio acordado (`quote_amount`) puede diferir del precio de lista del
 * plan: se aplica al proyecto después de aprobar, y de ahí lo toma la factura.
 */

export type CreateQuoteInput = {
  clientName: string
  clientEmail: string
  clientPhone?: string | null
  packageId: string
  eventDate: string
  /** Precio acordado. Si no viene, se usa el del plan. */
  amount?: number | null
  /** Nota visible para el cliente ("incluye 2 vestidos", "precio especial"). */
  note?: string | null
}

export type CreateQuoteResult = {
  ok: boolean
  quoteId: string
  token: string
  url: string
  amount: number
  emailed: boolean
}

function money(n: number): string {
  return `RD$${Number(n || 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateLabel(dateOnly: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateOnly.slice(0, 10)}T00:00:00Z`))
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://my.abbypixel.com"
  )
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Crea la cotización y le manda el correo al cliente con el link al formulario.
 */
export async function createManualQuote(
  studioId: string,
  actorId: string | null,
  input: CreateQuoteInput,
): Promise<CreateQuoteResult> {
  const sb = untypedService()

  const email = input.clientEmail.trim().toLowerCase()
  if (!email) throw new Error("QUOTE_EMAIL_REQUIRED")
  if (!input.eventDate) throw new Error("QUOTE_DATE_REQUIRED")

  // Plan + estudio (para el precio de lista y los slugs del link público).
  const { data: pkgRow } = await sb
    .from("packages")
    .select("id, name, slug, price, currency, event_type, studio_id")
    .eq("id", input.packageId)
    .eq("studio_id", studioId)
    .maybeSingle()
  if (!pkgRow) throw new Error("QUOTE_PACKAGE_NOT_FOUND")
  const pkg = pkgRow as {
    id: string
    name: string
    slug: string
    price: number | string
    currency: string | null
    event_type: string | null
  }

  const { data: studioRow } = await sb
    .from("studios")
    .select("id, name, slug")
    .eq("id", studioId)
    .maybeSingle()
  const studio = studioRow as { name: string; slug: string } | null
  if (!studio) throw new Error("QUOTE_STUDIO_NOT_FOUND")

  const listPrice = Number(pkg.price ?? 0)
  const amount =
    input.amount != null && Number.isFinite(input.amount) && input.amount > 0
      ? Math.round(Number(input.amount) * 100) / 100
      : listPrice

  const token = randomBytes(24).toString("base64url")
  const nowIso = new Date().toISOString()

  const { data: row, error } = await sb
    .from("booking_requests")
    .insert({
      studio_id: studioId,
      package_id: pkg.id,
      status: "quoted",
      client_name: input.clientName.trim(),
      client_email: email,
      client_phone: input.clientPhone?.trim() || null,
      event_date: input.eventDate.slice(0, 10),
      // Fotografía del plan y del precio al momento de cotizar: si mañana
      // cambia la lista de precios, la cotización enviada no se altera.
      package_snapshot: {
        id: pkg.id,
        name: pkg.name,
        slug: pkg.slug,
        event_type: pkg.event_type,
        list_price: listPrice,
      },
      pricing_snapshot: {
        list_price: listPrice,
        agreed_price: amount,
        currency: pkg.currency ?? "DOP",
      },
      metadata: { source: "cotizacion_manual" },
      quote_token: token,
      quote_amount: amount,
      quote_note: input.note?.trim() || null,
      quote_created_by: actorId,
      quote_sent_at: nowIso,
    })
    .select("id")
    .single()
  if (error) throwServiceError("QUOTE_CREATE_FAILED", error, { studioId })

  const quoteId = String((row as { id: string }).id)
  const url = `${appUrl()}/p/${studio.slug}/${pkg.slug}/book?q=${token}`

  // Correo al cliente con la cotización y el link al formulario.
  let emailed = false
  try {
    const { enqueueEmail } = await import("./email.service")
    const { resolveTemplate, TEMPLATE_CATALOG } = await import(
      "./email-template.service"
    )
    const d = TEMPLATE_CATALOG.booking_quote_sent
    const firstName = input.clientName.trim().split(/\s+/)[0] || ""
    const tpl = await resolveTemplate(
      studioId,
      "booking_quote_sent",
      {
        client_name: firstName || input.clientName,
        package_name: pkg.name,
        event_date: dateLabel(input.eventDate),
        quote_amount: money(amount),
        quote_note: input.note?.trim() || "",
        quote_url: url,
        studio_name: studio.name,
      },
      { subject: d.defaultSubject, bodyHtml: d.defaultBodyHtml },
    )
    await enqueueEmail({
      studioId,
      toEmail: email,
      toName: input.clientName,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      fromName: tpl.fromName,
      replyTo: tpl.replyTo,
      templateSlug: "booking_quote_sent",
      relatedEntityType: "booking_request",
      relatedEntityId: quoteId,
    })
    emailed = true
  } catch (e) {
    console.error("[cotizacion] correo", e instanceof Error ? e.message : e)
  }

  try {
    await logActivity({
      studioId,
      actorId,
      entityType: "booking_request",
      entityId: quoteId,
      action: "booking_quote.created",
      metadata: { amount, list_price: listPrice, package: pkg.name, emailed },
    })
  } catch {
    /* el historial no bloquea */
  }

  return { ok: true, quoteId, token, url, amount, emailed }
}

export type QuoteForForm = {
  id: string
  studioSlug: string
  packageSlug: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  eventDate: string
  amount: number
  note: string | null
  packageName: string
  alreadyAccepted: boolean
}

/**
 * Lee la cotización por su token, para prellenar el formulario público.
 * Público (sin sesión): solo devuelve lo que el propio cliente ya conoce.
 */
export async function getQuoteByToken(
  token: string,
): Promise<QuoteForForm | null> {
  if (!token || token.length < 10) return null
  const sb = untypedService()
  const { data } = await sb
    .from("booking_requests")
    .select(
      "id, status, client_name, client_email, client_phone, event_date, " +
        "quote_amount, quote_note, quote_accepted_at, package_snapshot, " +
        "studio:studios(slug), package:packages(name, slug)",
    )
    .eq("quote_token", token)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  const studio = one(r.studio as { slug: string } | { slug: string }[] | null)
  const pkg = one(
    r.package as { name: string; slug: string } | Array<{ name: string; slug: string }> | null,
  )
  if (!studio || !pkg) return null

  return {
    id: String(r.id),
    studioSlug: studio.slug,
    packageSlug: pkg.slug,
    clientName: String(r.client_name ?? ""),
    clientEmail: String(r.client_email ?? ""),
    clientPhone: (r.client_phone as string) ?? null,
    eventDate: String(r.event_date ?? "").slice(0, 10),
    amount: Number(r.quote_amount ?? 0),
    note: (r.quote_note as string) ?? null,
    packageName: pkg.name,
    // Si ya la aceptó, el formulario no debe volver a procesarla.
    alreadyAccepted:
      r.quote_accepted_at != null || String(r.status ?? "") !== "quoted",
  }
}

export type AcceptQuoteResult =
  | { status: "ok"; requestId: string }
  | { status: "not_found" }
  | { status: "already_accepted"; requestId: string }

/**
 * El cliente envió el formulario desde el link de su cotización.
 *
 * Completa los datos en la MISMA solicitud (no crea otra), la pasa a revisión
 * y la aprueba automáticamente: Abdiel ya aceptó el trato al cotizar. De ahí en
 * adelante corre el flujo normal (contrato → firma → factura → portal).
 */
export async function acceptQuote(params: {
  token: string
  data: {
    clientName: string
    clientEmail: string
    clientPhone?: string
    clientWhatsapp?: string
    eventType?: string
    eventDate: string
    eventTime?: string
    eventLocation?: string
    guestCount?: number
    additionalNotes?: string
  }
  customFields?: Array<{ key: string; label: string; value: string }>
  ip?: string | null
  userAgent?: string | null
}): Promise<AcceptQuoteResult> {
  const sb = untypedService()
  const { data: found } = await sb
    .from("booking_requests")
    .select(
      "id, studio_id, status, quote_amount, quote_accepted_at, metadata, quote_created_by",
    )
    .eq("quote_token", params.token)
    .maybeSingle()
  if (!found) return { status: "not_found" }

  const q = found as {
    id: string
    studio_id: string
    status: string
    quote_amount: number | string | null
    quote_accepted_at: string | null
    metadata: Record<string, unknown> | null
    quote_created_by: string | null
  }
  if (q.quote_accepted_at || q.status !== "quoted") {
    return { status: "already_accepted", requestId: q.id }
  }

  const d = params.data
  const nowIso = new Date().toISOString()
  const { error: upErr } = await sb
    .from("booking_requests")
    .update({
      client_name: d.clientName.trim(),
      client_email: d.clientEmail.trim().toLowerCase(),
      client_phone: d.clientPhone?.trim() || null,
      client_whatsapp: d.clientWhatsapp?.trim() || null,
      event_type: d.eventType || null,
      event_date: d.eventDate.slice(0, 10),
      event_time: d.eventTime || null,
      event_location: d.eventLocation || null,
      guest_count: d.guestCount ?? null,
      additional_notes: d.additionalNotes || null,
      status: "pending_review",
      quote_accepted_at: nowIso,
      updated_at: nowIso,
      metadata: {
        ...(q.metadata ?? {}),
        source: "cotizacion_manual",
        accepted_from_quote: true,
        custom_fields: params.customFields ?? [],
        accept_ip: params.ip ?? null,
        accept_user_agent: params.userAgent ?? null,
      },
    })
    .eq("id", q.id)
  if (upErr) throwServiceError("QUOTE_ACCEPT_FAILED", upErr, { id: q.id })

  // Aprobación automática: reusa TODA la cadena existente.
  try {
    const { approveBookingRequest } = await import("./booking-request.service")
    await approveBookingRequest({
      studioId: q.studio_id,
      requestId: q.id,
      actorId: q.quote_created_by ?? q.studio_id,
    })
  } catch (e) {
    // Si la aprobación falla, la solicitud queda en revisión: Abdiel la ve en
    // /bookings y puede aprobarla a mano. No se pierde nada.
    console.error(
      "[cotizacion] auto-aprobación falló",
      e instanceof Error ? e.message : e,
    )
  }

  // Precio acordado → proyecto (de ahí lo toma la factura al firmar).
  const acordado = Number(q.quote_amount ?? 0)
  if (acordado > 0) {
    try {
      const { data: created } = await sb
        .from("projects")
        .select("id, total_amount")
        .eq("booking_request_id", q.id)
        .is("deleted_at", null)
        .maybeSingle()
      const projectId = (created as { id: string } | null)?.id
      if (projectId) {
        await sb
          .from("projects")
          .update({ total_amount: acordado, updated_at: nowIso })
          .eq("id", projectId)
      }
    } catch (e) {
      console.error(
        "[cotizacion] no se pudo aplicar el precio acordado",
        e instanceof Error ? e.message : e,
      )
    }
  }

  try {
    await logActivity({
      studioId: q.studio_id,
      actorId: null,
      actorType: "system",
      entityType: "booking_request",
      entityId: q.id,
      action: "booking_quote.accepted",
      metadata: { amount: acordado },
    })
  } catch {
    /* el historial no bloquea */
  }

  return { status: "ok", requestId: q.id }
}

export type QuoteListItem = {
  id: string
  clientName: string
  clientEmail: string
  eventDate: string
  amount: number
  packageName: string
  status: string
  sentAt: string | null
  acceptedAt: string | null
  url: string
}

/** Cotizaciones del estudio (para la pantalla del CRM). */
export async function listQuotes(studioId: string): Promise<QuoteListItem[]> {
  const sb = untypedService()
  const { data: studioRow } = await sb
    .from("studios")
    .select("slug")
    .eq("id", studioId)
    .maybeSingle()
  const studioSlug = (studioRow as { slug: string } | null)?.slug ?? ""

  const { data } = await sb
    .from("booking_requests")
    .select(
      "id, client_name, client_email, event_date, status, quote_amount, " +
        "quote_token, quote_sent_at, quote_accepted_at, " +
        "package:packages(name, slug)",
    )
    .eq("studio_id", studioId)
    .not("quote_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const pkg = one(
      r.package as { name: string; slug: string } | Array<{ name: string; slug: string }> | null,
    )
    return {
      id: String(r.id),
      clientName: String(r.client_name ?? ""),
      clientEmail: String(r.client_email ?? ""),
      eventDate: String(r.event_date ?? "").slice(0, 10),
      amount: Number(r.quote_amount ?? 0),
      packageName: pkg?.name ?? "—",
      status: String(r.status ?? ""),
      sentAt: (r.quote_sent_at as string) ?? null,
      acceptedAt: (r.quote_accepted_at as string) ?? null,
      url: `${appUrl()}/p/${studioSlug}/${pkg?.slug ?? ""}/book?q=${String(r.quote_token ?? "")}`,
    }
  })
}
