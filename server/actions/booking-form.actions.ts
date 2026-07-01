"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { bookingFormConfigSchema, type BookingFormConfig } from "@/lib/forms/booking-form"
import { saveBookingFormConfig } from "@/server/services/booking-form.service"

export async function saveBookingFormConfigAction(
  config: BookingFormConfig,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  const parsed = bookingFormConfigSchema.safeParse(config)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Configuración inválida" }
  }
  // Claves de preguntas propias deben ser únicas.
  const keys = (parsed.data.customFields ?? []).map((f) => f.key.toLowerCase())
  if (new Set(keys).size !== keys.length) {
    return { ok: false, error: "Hay preguntas propias con la misma clave; renómbralas." }
  }
  try {
    await saveBookingFormConfig(session.studioId, parsed.data as BookingFormConfig)
    revalidatePath("/settings/booking-form")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}
