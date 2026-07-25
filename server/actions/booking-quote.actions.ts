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
  if (!packageId) return { ok: false as const, error: "Elige el plan" }
  if (!eventDate) return { ok: false as const, error: "Elige la fecha de la sesión" }

  const amount = rawAmount === "" ? null : Number(rawAmount)
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    return { ok: false as const, error: "El precio acordado no es válido" }
  }

  try {
    const r = await createManualQuote(session.studioId, session.userId, {
      clientName,
      clientEmail,
      clientPhone: String(formData.get("clientPhone") ?? "").trim() || null,
      packageId,
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
          : "No se pudo crear la cotización."
    return { ok: false as const, error: human }
  }
}
