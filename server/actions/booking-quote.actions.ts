"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createManualQuote } from "@/server/services/booking-quote.service"

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

  if (!clientName) return { ok: false as const, error: "Escribe el nombre del cliente" }
  if (!clientEmail || !clientEmail.includes("@"))
    return { ok: false as const, error: "Escribe un correo válido: ahí le llega la cotización" }
  if (!eventDate) return { ok: false as const, error: "Elige la fecha de la sesión" }

  // Cotización LIBRE: sin plan, con su propio presupuesto por líneas.
  const title = String(formData.get("title") ?? "").trim()
  if (!packageId && !title) {
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
    })
    revalidatePath("/cotizaciones")
    revalidatePath("/bookings")
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
