"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n"

/**
 * Cambia el locale del user (cookie). Server Component re-renderiza
 * con el nuevo locale en el siguiente request.
 */
export async function setLocaleAction(locale: string): Promise<{
  ok: boolean
  message?: string
}> {
  if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
    return { ok: false, message: "Locale no soportado" }
  }

  const cookieStore = await cookies()
  cookieStore.set("studioflow_locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 año
    sameSite: "lax",
    httpOnly: false, // accesible client-side para client components
  })

  revalidatePath("/")
  return { ok: true }
}
