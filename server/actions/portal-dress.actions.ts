"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { setSessionDressFromCatalog } from "@/server/services/session-dress.service"

/**
 * El CLIENTE elige su vestido desde el portal. Valida que el proyecto sea suyo
 * y que el vestido sea del catálogo de su estudio; el costo (rental_price) lo
 * resuelve el servidor — el cliente nunca lo envía ni lo ve.
 */
export async function selectSessionDressAction(
  projectId: string,
  catalogDressId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createSupabaseServiceClient() as any
    const { data: proj } = await sb
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("client_id", session.clientId)
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .maybeSingle()
    if (!proj) return { ok: false, error: "Sesión no encontrada" }

    await setSessionDressFromCatalog(session.studioId, projectId, catalogDressId)
    revalidatePath(`/portal/sessions/${projectId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" }
  }
}
