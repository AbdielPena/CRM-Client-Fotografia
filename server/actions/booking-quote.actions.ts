"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  cancelQuote,
  createManualQuote,
  resendQuoteEmail,
} from "@/server/services/booking-quote.service"
import type { ProjectEventInput } from "@/server/services/project-event.service"

/**
 * Registra una cotización acordada por fuera (WhatsApp, llamada, en persona) y
 * le manda el correo al cliente con el link para completar sus datos.
 */
export async function createQuoteAction(formData: FormData) {
  const session = await requireStudioAuth()

  const clientName = String(formData.get("clientName") ?? "").trim()
  const clientEmail = String(formData.get("clientEmail") ?? "").trim()
  const packageId = String(formData.get("packageId") ?? "").trim()
  const eventDate = String(formData.get("eventDate") ?? "").trim()
  const rawAmount = String(formData.get("amount") ?? "").trim()

  // Las fechas del trabajo. Con varias (la sesión un día, la fiesta otro) cada
  // una lleva lo suyo: fotos, plazo, impresiones, Book Experience.
  let events: ProjectEventInput[] = []
  try {
    const raw = String(formData.get("events") ?? "")
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) events = parsed as ProjectEventInput[]
    }
  } catch {
    return { ok: false as const, error: "Las fechas tienen un formato inválido" }
  }

  if (!clientName) return { ok: false as const, error: "Escribe el nombre del cliente" }
  if (!clientEmail || !clientEmail.includes("@"))
    return { ok: false as const, error: "Escribe un correo válido: ahí le llega la cotización" }
  if (!eventDate && events.length === 0)
    return { ok: false as const, error: "Elige la fecha de la sesión" }
  if (events.some((e) => !String(e?.eventDate ?? "").trim()))
    return { ok: false as const, error: "Cada evento necesita su fecha" }

  // Cotización LIBRE: sin plan, con su propio presupuesto por líneas.
  const title = String(formData.get("title") ?? "").trim()
  if (!packageId && !title && events.length === 0) {
    return {
      ok: false as const,
      error: "Escribe el título del trabajo que estás cotizando",
    }
  }
  let items: Array<{ concept: string; qty: number; price: number }> = []
  try {
    const raw = String(formData.get("items") ?? "")
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        items = parsed
          .map((i) => {
            const o = i as Record<string, unknown>
            return {
              concept: String(o.concept ?? "").trim(),
              qty: Number(o.qty) > 0 ? Number(o.qty) : 1,
              price: Number(o.price) || 0,
            }
          })
          .filter((i) => i.concept !== "" || i.price > 0)
      }
    }
  } catch {
    return { ok: false as const, error: "El presupuesto tiene un formato inválido" }
  }

  let deliverables: string[] = []
  try {
    const raw = String(formData.get("deliverables") ?? "")
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        deliverables = parsed.map((d) => String(d ?? "").trim()).filter(Boolean)
      }
    }
  } catch {
    deliverables = []
  }

  const amount = rawAmount === "" ? null : Number(rawAmount)
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    return { ok: false as const, error: "El precio acordado no es válido" }
  }

  try {
    const r = await createManualQuote(session.studioId, session.userId, {
      clientName,
      clientEmail,
      clientPhone: String(formData.get("clientPhone") ?? "").trim() || null,
      packageId: packageId || null,
      title: title || null,
      items,
      deliverables,
      eventDate,
      amount,
      note: String(formData.get("note") ?? "").trim() || null,
      events,
    })
    revalidatePath("/cotizaciones")
    revalidatePath("/bookings")
    revalidatePath("/calendar")
    return { ...r, ok: true as const }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "QUOTE_FAILED"
    const human =
      msg === "QUOTE_PACKAGE_NOT_FOUND"
        ? "No se encontró ese plan."
        : msg === "QUOTE_DATE_REQUIRED"
          ? "Falta la fecha de la sesión."
          : msg === "QUOTE_TITLE_REQUIRED"
            ? "Escribe el título del trabajo cotizado."
            : msg === "QUOTE_AMOUNT_REQUIRED"
              ? "El presupuesto no puede quedar en cero."
              : "No se pudo crear la cotización."
    return { ok: false as const, error: human }
  }
}

/** Le vuelve a mandar el correo de la cotización al cliente. */
export async function resendQuoteAction(quoteId: string, toEmail?: string) {
  const session = await requireStudioAuth()
  try {
    const r = await resendQuoteEmail(
      session.studioId,
      session.userId,
      quoteId,
      toEmail,
    )
    revalidatePath(`/cotizaciones/${quoteId}`)
    revalidatePath("/cotizaciones")
    return { ok: true as const, sentTo: r.sentTo }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    return {
      ok: false as const,
      error:
        msg === "QUOTE_ALREADY_ACCEPTED"
          ? "Esta cotización ya fue aceptada: el cliente tiene su contrato y su factura."
          : msg === "QUOTE_NOT_FOUND"
            ? "No se encontró la cotización."
            : "No se pudo reenviar el correo.",
    }
  }
}

/** Anula una cotización que no llegó a nada. No borra el registro. */
export async function cancelQuoteAction(quoteId: string) {
  const session = await requireStudioAuth()
  try {
    await cancelQuote(session.studioId, session.userId, quoteId)
    revalidatePath(`/cotizaciones/${quoteId}`)
    revalidatePath("/cotizaciones")
    revalidatePath("/calendar")
    return { ok: true as const }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    return {
      ok: false as const,
      error:
        msg === "QUOTE_ALREADY_ACCEPTED"
          ? "Ya fue aceptada y tiene sesión: cancélala desde la sesión."
          : "No se pudo anular la cotización.",
    }
  }
}
