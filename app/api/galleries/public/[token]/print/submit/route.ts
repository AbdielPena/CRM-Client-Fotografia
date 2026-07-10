import { NextResponse, type NextRequest } from "next/server"

import { validateGalleryToken } from "@/server/services/gallery.service"
import {
  getGalleryPrintState,
  submitGalleryPrintSelection,
} from "@/server/services/print-selection.service"
import { apiError } from "@/lib/utils/api-error"

export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })

    // Por defecto NO bloquea (el cliente puede ajustar; el estudio cierra cuando quiera).
    await submitGalleryPrintSelection({ galleryId: view.gallery.id, lock: false })

    // Notifica al estudio (in-app) + confirma al cliente por correo/WhatsApp (best-effort).
    void notifyStudioPrintSubmitted(view.gallery.id)
    void import("@/server/services/print-email.service").then((m) =>
      m.onPrintSelectionSubmitted(view.gallery.id),
    )

    const state = await getGalleryPrintState(view.gallery.id)
    return NextResponse.json({ ok: true, state })
  } catch (e) {
    return apiError(e)
  }
}

async function notifyStudioPrintSubmitted(galleryId: string): Promise<void> {
  try {
    const { createSupabaseServiceClient } = await import("@/server/supabase/service")
    const { notify } = await import("@/server/services/notification.service")
    const sb = createSupabaseServiceClient()
    const { data: g } = await sb
      .from("galleries")
      .select("studio_id, name, client_id")
      .eq("id", galleryId)
      .maybeSingle()
    const gallery = g as { studio_id: string; name: string; client_id: string | null } | null
    if (!gallery) return
    let clientName = "Un cliente"
    if (gallery.client_id) {
      const { data: c } = await sb
        .from("clients")
        .select("name")
        .eq("id", gallery.client_id)
        .maybeSingle()
      clientName = (c as { name?: string } | null)?.name ?? clientName
    }
    await notify({
      studioId: gallery.studio_id,
      type: "gallery_selection_submitted",
      title: "Selección de impresión recibida",
      body: `${clientName} envió su selección de impresiones en "${gallery.name}".`,
      relatedEntityType: "gallery",
      relatedEntityId: galleryId,
      actionUrl: `/galleries`,
    })
  } catch (err) {
    console.error("[print] notifyStudioPrintSubmitted", err)
  }
}
