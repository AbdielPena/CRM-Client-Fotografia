import "server-only"

import { randomBytes } from "node:crypto"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import {
  attachQuoteEventsToProject,
  createQuoteEvents,
  eventsTotal,
  listEventsByQuote,
  listEventsByQuotePublic,
  normalizeEvents,
  primaryEvent,
  type ProjectEvent,
  type ProjectEventInput,
} from "./project-event.service"

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

/** Una línea del presupuesto libre. */
export type QuoteItem = {
  concept: string
  qty: number
  price: number
}

export type CreateQuoteInput = {
  clientName: string
  clientEmail: string
  clientPhone?: string | null
  /** Plan de la lista. Vacío = cotización LIBRE (con su propio presupuesto). */
  packageId?: string | null
  /** Título del trabajo cotizado. Obligatorio si no hay plan. */
  title?: string | null
  /** Desglose del presupuesto (cotización libre). */
  items?: QuoteItem[]
  /** Qué recibe el cliente: digitales, plazos, impresiones, álbum, marcos… */
  deliverables?: string[]
  eventDate: string
  /** Precio acordado. Si no viene: el del plan, o la suma de las líneas. */
  amount?: number | null
  /** Nota visible para el cliente ("incluye 2 vestidos", "precio especial"). */
  note?: string | null
  /**
   * Las fechas del trabajo. Una quinceañera puede llevar la sesión de fotos un
   * día (con un plan) y la fiesta otro (cotizada aparte), cada una con lo suyo.
   * Vacío = cotización de una sola fecha, como siempre.
   */
  events?: ProjectEventInput[]
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

/**
 * A dónde manda el link de la cotización.
 *
 * Con un solo plan y una sola fecha: el formulario público de ese plan, como
 * siempre. Con VARIOS eventos: la ruta propia, sí o sí — el formulario de un
 * plan pide UNA fecha y no sabe nada de una fiesta en otro día.
 */
function quoteUrl(p: {
  appUrl: string
  token: string
  studioSlug: string
  packageSlug: string | null
  eventCount: number
}): string {
  const suelta = `${p.appUrl}/cotizacion/${p.token}`
  if (p.eventCount > 1 || !p.packageSlug) return suelta
  return `${p.appUrl}/p/${p.studioSlug}/${p.packageSlug}/book?q=${p.token}`
}

/** Texto del usuario dentro de HTML: se escapa y se respetan los saltos. */
function textoHtml(s: string): string {
  const esc = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return esc.replace(/\r?\n/g, "<br/>")
}

/** Lo que incluye un evento, en una línea legible. */
export function eventSummary(e: {
  photoCount?: number | null
  deliveryDays?: number | null
  includesPrints?: boolean
  includesBook?: boolean
}): string[] {
  const partes: string[] = []
  if (e.photoCount != null && e.photoCount > 0)
    partes.push(`${e.photoCount} fotos editadas`)
  if (e.deliveryDays != null)
    partes.push(
      e.deliveryDays === 0
        ? "entrega el mismo día"
        : `entrega en ${e.deliveryDays} días`,
    )
  if (e.includesPrints) partes.push("incluye impresiones")
  if (e.includesBook) partes.push("incluye Book Experience")
  return partes
}

/** Las fechas del trabajo, para el correo de la cotización. */
function eventsHtml(eventos: ProjectEventInput[]): string {
  if (eventos.length === 0) return ""
  const filas = eventos
    .map((e) => {
      const detalle = eventSummary(e)
      return (
        `<li style="margin-bottom:6px"><strong>${textoHtml(e.name)}</strong> — ` +
        `${dateLabel(e.eventDate)}` +
        (e.eventTime ? `, ${e.eventTime}` : "") +
        (e.location ? `<br/><span style="opacity:.75">${textoHtml(e.location)}</span>` : "") +
        (detalle.length > 0
          ? `<br/><span style="opacity:.75">${textoHtml(detalle.join(" · "))}</span>`
          : "") +
        "</li>"
      )
    })
    .join("")
  return `<p style="margin:12px 0 4px"><strong>Fechas:</strong></p><ul style="margin:0;padding-left:18px">${filas}</ul>`
}

/**
 * Lo acordado, escrito en las notas de la sesión: es la constancia de qué se
 * cotizó, visible desde el detalle sin tener que abrir la cotización.
 */
function notasDeLaCotizacion(
  deliverables: string[],
  eventos: ProjectEvent[],
): string | null {
  const bloques: string[] = []
  if (eventos.length > 0) {
    bloques.push(
      "Fechas (según cotización):\n" +
        eventos
          .map((e) => {
            const detalle = eventSummary(e)
            return (
              `• ${e.name} — ${dateLabel(e.eventDate)}` +
              (e.eventTime ? `, ${e.eventTime}` : "") +
              (e.location ? ` · ${e.location}` : "") +
              (detalle.length > 0 ? `\n  ${detalle.join(" · ")}` : "")
            )
          })
          .join("\n"),
    )
  }
  if (deliverables.length > 0) {
    bloques.push(
      "Incluye (según cotización):\n" +
        deliverables.map((d) => "• " + d).join("\n"),
    )
  }
  return bloques.length > 0 ? bloques.join("\n\n") : null
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

  // Las fechas del trabajo. La del evento PRINCIPAL es la que queda como fecha
  // de la cotización (y mañana como fecha de la sesión), para que todo lo que
  // ya lee `event_date` siga funcionando igual.
  const eventos = normalizeEvents(input.events)
  const principal = primaryEvent(eventos)
  const eventDate = principal?.eventDate || input.eventDate
  if (!eventDate) throw new Error("QUOTE_DATE_REQUIRED")

  // Presupuesto libre: líneas propias, sin plan de la lista.
  const items = (input.items ?? [])
    .map((i) => ({
      concept: String(i.concept ?? "").trim(),
      qty: Number(i.qty) > 0 ? Number(i.qty) : 1,
      price: Number(i.price) || 0,
    }))
    .filter((i) => i.concept !== "" || i.price > 0)
  const itemsTotal = items.reduce((s2, i) => s2 + i.qty * i.price, 0)
  const deliverables = (input.deliverables ?? [])
    .map((d) => String(d ?? "").trim())
    .filter((d) => d !== "")

  // Plan (opcional). Sin plan hace falta un título: es lo que nombra la sesión.
  type QuotePkg = {
    id: string
    name: string
    slug: string
    price: number | string
    currency: string | null
    event_type: string | null
  }
  let pkg: QuotePkg | null = null
  if (input.packageId) {
    const { data: pkgRow } = await sb
      .from("packages")
      .select("id, name, slug, price, currency, event_type, studio_id")
      .eq("id", input.packageId)
      .eq("studio_id", studioId)
      .maybeSingle()
    if (!pkgRow) throw new Error("QUOTE_PACKAGE_NOT_FOUND")
    pkg = pkgRow as QuotePkg
  } else if (!input.title?.trim() && eventos.length === 0) {
    throw new Error("QUOTE_TITLE_REQUIRED")
  }
  const title =
    input.title?.trim() || pkg?.name || principal?.name || "Cotización"

  const { data: studioRow } = await sb
    .from("studios")
    .select("id, name, slug")
    .eq("id", studioId)
    .maybeSingle()
  const studio = studioRow as { name: string; slug: string } | null
  if (!studio) throw new Error("QUOTE_STUDIO_NOT_FOUND")

  // Precio de lista: lo que suman los eventos y las líneas libres. Si no se
  // puso monto en ninguno (cotización de un solo plan, como siempre), cae al
  // precio del plan.
  const sumaDetalle = eventsTotal(eventos) + itemsTotal
  const listPrice =
    sumaDetalle > 0 ? sumaDetalle : pkg ? Number(pkg.price ?? 0) : itemsTotal
  const amount =
    input.amount != null && Number.isFinite(input.amount) && input.amount > 0
      ? Math.round(Number(input.amount) * 100) / 100
      : listPrice
  if (amount <= 0) throw new Error("QUOTE_AMOUNT_REQUIRED")

  const token = randomBytes(24).toString("base64url")
  const nowIso = new Date().toISOString()

  const { data: row, error } = await sb
    .from("booking_requests")
    .insert({
      studio_id: studioId,
      package_id: pkg?.id ?? null,
      status: "quoted",
      client_name: input.clientName.trim(),
      client_email: email,
      client_phone: input.clientPhone?.trim() || null,
      event_date: eventDate.slice(0, 10),
      // Fotografía del plan y del precio al momento de cotizar: si mañana
      // cambia la lista de precios, la cotización enviada no se altera.
      package_snapshot: pkg
        ? {
            id: pkg.id,
            name: pkg.name,
            slug: pkg.slug,
            event_type: pkg.event_type,
            list_price: listPrice,
          }
        : { custom: true, title },
      pricing_snapshot: {
        list_price: listPrice,
        agreed_price: amount,
        items,
        currency: pkg?.currency ?? "DOP",
      },
      metadata: { source: "cotizacion_manual" },
      quote_token: token,
      quote_amount: amount,
      quote_title: title,
      quote_items: items,
      quote_deliverables: deliverables,
      quote_note: input.note?.trim() || null,
      quote_created_by: actorId,
      quote_sent_at: nowIso,
    })
    .select("id")
    .single()
  if (error) throwServiceError("QUOTE_CREATE_FAILED", error, { studioId })

  const quoteId = String((row as { id: string }).id)

  // Las fechas del trabajo, cada una con lo suyo.
  if (eventos.length > 0) {
    await createQuoteEvents(studioId, quoteId, eventos)
  }

  const url = quoteUrl({
    appUrl: appUrl(),
    token,
    studioSlug: studio.slug,
    packageSlug: pkg?.slug ?? null,
    eventCount: eventos.length,
  })

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
        package_name: title,
        event_date: dateLabel(eventDate),
        quote_amount: money(amount),
        quote_note: input.note?.trim() ? textoHtml(input.note.trim()) : "",
        // Las fechas van ANTES de lo que incluye: con una fiesta y una sesión
        // de fotos en días distintos, lo primero que la clienta busca en el
        // correo es cuándo es cada cosa.
        deliverables:
          eventsHtml(eventos) +
          (deliverables.length > 0
            ? `<p style="margin:12px 0 4px"><strong>Qué incluye:</strong></p><ul style="margin:0;padding-left:18px">${deliverables
                .map((d) => `<li>${textoHtml(d)}</li>`)
                .join("")}</ul>`
            : ""),
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
      metadata: {
        amount,
        list_price: listPrice,
        package: pkg?.name ?? null,
        title,
        emailed,
        events: eventos.length,
      },
    })
  } catch {
    /* el historial no bloquea */
  }

  return { ok: true, quoteId, token, url, amount, emailed }
}

export type QuoteForForm = {
  id: string
  studioSlug: string
  studioName: string
  /** Vacío en cotizaciones libres (sin plan). */
  packageSlug: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  eventDate: string
  amount: number
  note: string | null
  packageName: string
  title: string
  items: QuoteItem[]
  deliverables: string[]
  currency: string
  alreadyAccepted: boolean
  /** Las fechas del trabajo. Vacío = cotización de una sola fecha. */
  events: ProjectEvent[]
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
        "quote_amount, quote_note, quote_accepted_at, quote_title, quote_items, quote_deliverables, " +
        "pricing_snapshot, studio:studios(slug, name, currency), package:packages(name, slug)",
    )
    .eq("quote_token", token)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  const studio = one(
    r.studio as
      | { slug: string; name: string; currency: string | null }
      | Array<{ slug: string; name: string; currency: string | null }>
      | null,
  )
  const pkg = one(
    r.package as { name: string; slug: string } | Array<{ name: string; slug: string }> | null,
  )
  // Sin plan es válido (cotización libre); sin estudio no.
  if (!studio) return null

  const events = await listEventsByQuotePublic(String(r.id))

  return {
    events,
    id: String(r.id),
    studioSlug: studio.slug,
    studioName: studio.name,
    packageSlug: pkg?.slug ?? "",
    clientName: String(r.client_name ?? ""),
    clientEmail: String(r.client_email ?? ""),
    clientPhone: (r.client_phone as string) ?? null,
    eventDate: String(r.event_date ?? "").slice(0, 10),
    amount: Number(r.quote_amount ?? 0),
    note: (r.quote_note as string) ?? null,
    packageName: pkg?.name ?? String(r.quote_title ?? "Cotización"),
    title: String(r.quote_title ?? pkg?.name ?? "Cotización"),
    items: Array.isArray(r.quote_items) ? (r.quote_items as QuoteItem[]) : [],
    deliverables: Array.isArray(r.quote_deliverables)
      ? (r.quote_deliverables as string[])
      : [],
    currency: studio.currency ?? "DOP",
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
      "id, studio_id, status, quote_amount, quote_accepted_at, metadata, " +
        "quote_created_by, quote_title, package_id, quote_deliverables, client_name",
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
    quote_title: string | null
    package_id: string | null
    quote_deliverables: string[] | null
    client_name: string | null
  }
  if (q.quote_accepted_at || q.status !== "quoted") {
    return { status: "already_accepted", requestId: q.id }
  }

  const d = params.data
  const nowIso = new Date().toISOString()

  // Con varias fechas, la del evento PRINCIPAL es la de la sesión. El
  // formulario ya no las vuelve a pedir: se acordaron al cotizar.
  const eventos = await listEventsByQuotePublic(q.id)
  const principal = primaryEvent(eventos)

  const { error: upErr } = await sb
    .from("booking_requests")
    .update({
      client_name: d.clientName.trim(),
      client_email: d.clientEmail.trim().toLowerCase(),
      client_phone: d.clientPhone?.trim() || null,
      client_whatsapp: d.clientWhatsapp?.trim() || null,
      event_type: principal?.eventType || d.eventType || null,
      event_date: (principal?.eventDate || d.eventDate).slice(0, 10),
      event_time: principal?.eventTime || d.eventTime || null,
      event_location: principal?.location || d.eventLocation || null,
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
  //
  // `approved_by` es una FK a auth.users: NUNCA se puede mandar el id del
  // estudio como actor (violaría la FK). Si la cotización no guardó quién la
  // creó, se usa al dueño del estudio.
  let actorId = q.quote_created_by
  if (!actorId) {
    const { data: owner } = await sb
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", q.studio_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    actorId = (owner as { user_id: string } | null)?.user_id ?? null
  }
  try {
    if (!actorId) throw new Error("el estudio no tiene usuario dueño")
    const { approveBookingRequest } = await import("./booking-request.service")
    await approveBookingRequest({
      studioId: q.studio_id,
      requestId: q.id,
      actorId,
      // Ruta pública: sin sesión del CRM, la RLS bloquearía el UPDATE.
      elevated: true,
    })
  } catch (e) {
    // Si la aprobación falla, la solicitud queda en revisión: Abdiel la ve en
    // /bookings y puede aprobarla a mano. No se pierde nada.
    console.error(
      "[cotizacion] auto-aprobación falló",
      e instanceof Error ? e.message : e,
    )
  }

  // Lo acordado → la sesión que acaba de nacer.
  const acordado = Number(q.quote_amount ?? 0)
  try {
    // La conversión escribe `booking_requests.project_id`; el contrato que
    // creó es el respaldo por si esa escritura no llegó.
    const { data: refrescado } = await sb
      .from("booking_requests")
      .select("project_id")
      .eq("id", q.id)
      .maybeSingle()
    let projectId =
      (refrescado as { project_id: string | null } | null)?.project_id ?? null
    if (!projectId) {
      const { data: created } = await sb
        .from("contracts")
        .select("project_id")
        .eq("booking_request_id", q.id)
        .not("project_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      projectId = (created as { project_id: string } | null)?.project_id ?? null
    }

    if (projectId) {
      // Las fechas cotizadas pasan a ser las de la sesión. UNA sesión con
      // varias fechas: no se parte en dos, ni se duplica el contrato.
      const conSesion =
        eventos.length > 0
          ? await attachQuoteEventsToProject(q.id, projectId)
          : null

      const patch: Record<string, unknown> = { updated_at: nowIso }
      if (acordado > 0) patch.total_amount = acordado

      // Sin plan, la sesión se llama "Cliente — trabajo cotizado". El
      // nombre del cliente va SIEMPRE delante: sin él la sesión no aparecía
      // al buscar por el cliente y parecía que nunca se había creado.
      if (!q.package_id && q.quote_title) {
        const cliente = (q.client_name ?? "").trim()
        patch.name = cliente ? `${cliente} — ${q.quote_title}` : q.quote_title
      }

      const ppal = conSesion ?? principal
      if (ppal) {
        // La fecha de la sesión es la del evento principal: es la que usan el
        // tablero, el recordatorio de saldo y el aviso de "sesión realizada".
        patch.event_date = ppal.eventDate
        if (ppal.eventTime) patch.event_time = ppal.eventTime
        if (ppal.eventEndTime) patch.event_end_time = ppal.eventEndTime
        if (ppal.location) patch.location = ppal.location
        // El plan del evento principal, si la sesión no traía uno.
        if (ppal.packageId && !q.package_id) patch.package_id = ppal.packageId
        // El plazo acordado manda sobre el del plan y el de la categoría.
        if (ppal.deliveryDays != null)
          patch.delivery_days_override = ppal.deliveryDays
      }

      // Lo acordado queda escrito en la sesión (constancia de qué incluye).
      const notas = notasDeLaCotizacion(
        Array.isArray(q.quote_deliverables) ? q.quote_deliverables : [],
        eventos,
      )
      if (notas) patch.notes = notas

      await sb.from("projects").update(patch).eq("id", projectId)

      // Cada fecha, al calendario. La principal la lleva `syncProjectById`
      // (que ya corrió al aprobar, pero la sesión acaba de cambiar de hora y
      // lugar); las demás tienen su propio evento de Google.
      try {
        const { syncProjectById, syncProjectEventToGoogle } = await import(
          "./google-calendar.service"
        )
        await syncProjectById(q.studio_id, projectId).catch(() => false)
        for (const ev of eventos) {
          if (ev.isPrimary) continue
          await syncProjectEventToGoogle(q.studio_id, ev.id).catch(() => null)
        }
      } catch (e) {
        // El calendario nunca bloquea la reserva.
        console.error(
          "[cotizacion] calendario",
          e instanceof Error ? e.message : e,
        )
      }
    }
  } catch (e) {
    console.error(
      "[cotizacion] no se pudo aplicar lo acordado a la sesión",
      e instanceof Error ? e.message : e,
    )
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
  /** Cuántas fechas lleva. 0 = de una sola fecha, como las de siempre. */
  eventCount: number
  /** La sesión que salió de ella, si el cliente ya aceptó. */
  projectId: string | null
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
        "quote_token, quote_sent_at, quote_accepted_at, quote_title, package_id, " +
        "project_id, package:packages(name, slug), " +
        "events:project_events(id)",
    )
    .eq("studio_id", studioId)
    .not("quote_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const pkg = one(
      r.package as { name: string; slug: string } | Array<{ name: string; slug: string }> | null,
    )
    const eventCount = Array.isArray(r.events) ? r.events.length : 0
    return {
      id: String(r.id),
      clientName: String(r.client_name ?? ""),
      clientEmail: String(r.client_email ?? ""),
      eventDate: String(r.event_date ?? "").slice(0, 10),
      amount: Number(r.quote_amount ?? 0),
      packageName: pkg?.name ?? String(r.quote_title ?? "Cotización libre"),
      status: String(r.status ?? ""),
      sentAt: (r.quote_sent_at as string) ?? null,
      acceptedAt: (r.quote_accepted_at as string) ?? null,
      eventCount,
      projectId: (r.project_id as string) ?? null,
      url: quoteUrl({
        appUrl: appUrl(),
        token: String(r.quote_token ?? ""),
        studioSlug,
        packageSlug: r.package_id ? (pkg?.slug ?? null) : null,
        eventCount,
      }),
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Gestionar una cotización
//
// Hasta ahora /cotizaciones era una lista y nada más: no se podía abrir una,
// ver qué incluye, reenviarla ni anularla. Todo lo acordado quedaba enterrado
// en la fila de `booking_requests`.
// ═══════════════════════════════════════════════════════════════════════════

export type QuoteDetail = {
  id: string
  token: string
  url: string
  status: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  title: string
  packageId: string | null
  packageName: string | null
  amount: number
  listPrice: number
  currency: string
  note: string | null
  items: QuoteItem[]
  deliverables: string[]
  events: ProjectEvent[]
  eventDate: string
  eventLocation: string | null
  additionalNotes: string | null
  sentAt: string | null
  acceptedAt: string | null
  createdAt: string | null
  /** La sesión que salió de ella. Null = el cliente todavía no la aceptó. */
  projectId: string | null
  /** Mientras nadie la haya aceptado todavía se puede tocar. */
  editable: boolean
}

export async function getQuoteDetail(
  studioId: string,
  quoteId: string,
): Promise<QuoteDetail | null> {
  const sb = untypedService()
  const { data: studioRow } = await sb
    .from("studios")
    .select("slug, currency")
    .eq("id", studioId)
    .maybeSingle()
  const studio = studioRow as { slug: string; currency: string | null } | null

  const { data } = await sb
    .from("booking_requests")
    .select(
      "id, status, client_name, client_email, client_phone, event_date, " +
        "event_location, additional_notes, created_at, project_id, package_id, " +
        "quote_token, quote_amount, quote_title, quote_items, quote_deliverables, " +
        "quote_note, quote_sent_at, quote_accepted_at, pricing_snapshot, " +
        "package:packages(id, name)",
    )
    .eq("studio_id", studioId)
    .eq("id", quoteId)
    .not("quote_token", "is", null)
    .maybeSingle()
  if (!data) return null

  const r = data as Record<string, unknown>
  const pkg = one(
    r.package as { id: string; name: string } | Array<{ id: string; name: string }> | null,
  )
  const events = await listEventsByQuote(studioId, quoteId)
  const snap = (r.pricing_snapshot ?? {}) as Record<string, unknown>
  const token = String(r.quote_token ?? "")
  const aceptada = r.quote_accepted_at != null || String(r.status ?? "") !== "quoted"

  return {
    id: String(r.id),
    token,
    url: quoteUrl({
      appUrl: appUrl(),
      token,
      studioSlug: studio?.slug ?? "",
      packageSlug: null,
      eventCount: events.length,
    }),
    status: String(r.status ?? ""),
    clientName: String(r.client_name ?? ""),
    clientEmail: String(r.client_email ?? ""),
    clientPhone: (r.client_phone as string) ?? null,
    title: String(r.quote_title ?? pkg?.name ?? "Cotización"),
    packageId: (r.package_id as string) ?? null,
    packageName: pkg?.name ?? null,
    amount: Number(r.quote_amount ?? 0),
    listPrice: Number(snap.list_price ?? r.quote_amount ?? 0),
    currency: String(snap.currency ?? studio?.currency ?? "DOP"),
    note: (r.quote_note as string) ?? null,
    items: Array.isArray(r.quote_items) ? (r.quote_items as QuoteItem[]) : [],
    deliverables: Array.isArray(r.quote_deliverables)
      ? (r.quote_deliverables as string[])
      : [],
    events,
    eventDate: String(r.event_date ?? "").slice(0, 10),
    eventLocation: (r.event_location as string) ?? null,
    additionalNotes: (r.additional_notes as string) ?? null,
    sentAt: (r.quote_sent_at as string) ?? null,
    acceptedAt: (r.quote_accepted_at as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
    projectId: (r.project_id as string) ?? null,
    editable: !aceptada,
  }
}

/**
 * Vuelve a mandarle el correo al cliente (se le perdió, cambió de correo, o
 * simplemente hay que recordárselo). Es el MISMO correo del envío original.
 */
export async function resendQuoteEmail(
  studioId: string,
  actorId: string | null,
  quoteId: string,
  toEmail?: string | null,
): Promise<{ ok: boolean; sentTo: string }> {
  const q = await getQuoteDetail(studioId, quoteId)
  if (!q) throw new Error("QUOTE_NOT_FOUND")
  if (!q.editable) throw new Error("QUOTE_ALREADY_ACCEPTED")

  const sb = untypedService()
  const { data: studioRow } = await sb
    .from("studios")
    .select("name")
    .eq("id", studioId)
    .maybeSingle()
  const studioName = (studioRow as { name: string } | null)?.name ?? "El estudio"

  const destino = (toEmail?.trim() || q.clientEmail).toLowerCase()
  if (!destino.includes("@")) throw new Error("QUOTE_EMAIL_REQUIRED")

  const { enqueueEmail } = await import("./email.service")
  const { resolveTemplate, TEMPLATE_CATALOG } = await import(
    "./email-template.service"
  )
  const d = TEMPLATE_CATALOG.booking_quote_sent
  const firstName = q.clientName.trim().split(/\s+/)[0] || q.clientName
  const tpl = await resolveTemplate(
    studioId,
    "booking_quote_sent",
    {
      client_name: firstName,
      package_name: q.title,
      event_date: dateLabel(q.events[0]?.eventDate || q.eventDate),
      quote_amount: money(q.amount),
      quote_note: q.note ? textoHtml(q.note) : "",
      deliverables:
        eventsHtml(q.events) +
        (q.deliverables.length > 0
          ? `<p style="margin:12px 0 4px"><strong>Qué incluye:</strong></p><ul style="margin:0;padding-left:18px">${q.deliverables
              .map((x) => `<li>${textoHtml(x)}</li>`)
              .join("")}</ul>`
          : ""),
      quote_url: q.url,
      studio_name: studioName,
    },
    { subject: d.defaultSubject, bodyHtml: d.defaultBodyHtml },
  )
  await enqueueEmail({
    studioId,
    toEmail: destino,
    toName: q.clientName,
    subject: tpl.subject,
    bodyHtml: tpl.bodyHtml,
    fromName: tpl.fromName,
    replyTo: tpl.replyTo,
    templateSlug: "booking_quote_sent",
    relatedEntityType: "booking_request",
    relatedEntityId: q.id,
  })

  try {
    await logActivity({
      studioId,
      actorId,
      entityType: "booking_request",
      entityId: q.id,
      action: "booking_quote.resent",
      metadata: { to: destino },
    })
  } catch {
    /* el historial no bloquea */
  }
  return { ok: true, sentTo: destino }
}

/**
 * Anula una cotización que no fue a ninguna parte. No borra nada: queda el
 * registro de que se cotizó y por cuánto.
 */
export async function cancelQuote(
  studioId: string,
  actorId: string | null,
  quoteId: string,
): Promise<void> {
  const sb = untypedService()
  const { data: row } = await sb
    .from("booking_requests")
    .select("id, status, quote_accepted_at, project_id")
    .eq("studio_id", studioId)
    .eq("id", quoteId)
    .maybeSingle()
  const q = row as {
    status: string
    quote_accepted_at: string | null
    project_id: string | null
  } | null
  if (!q) throw new Error("QUOTE_NOT_FOUND")
  // Aceptada ya hay contrato, factura y sesión: eso se cancela desde la sesión,
  // no desde aquí, o quedaría un cobro vivo sin cotización que lo respalde.
  if (q.quote_accepted_at || q.project_id) throw new Error("QUOTE_ALREADY_ACCEPTED")

  const { error } = await sb
    .from("booking_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("studio_id", studioId)
    .eq("id", quoteId)
  if (error) throwServiceError("QUOTE_CANCEL_FAILED", error, { quoteId })

  try {
    await logActivity({
      studioId,
      actorId,
      entityType: "booking_request",
      entityId: quoteId,
      action: "booking_quote.cancelled",
    })
  } catch {
    /* el historial no bloquea */
  }
}
