import { NextResponse } from "next/server"

import {
  validateGalleryToken,
  setMotherDedication,
  setMotherDedicationEnabled,
} from "@/server/services/gallery.service"

/**
 * Dedicatoria de la madre (mensaje para su hija en la entrega). Público: la
 * madre la escribe/edita desde el link /g/[token]/dedicatoria — validado por el
 * token de la galería, sin login.
 */
export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as {
    message?: string
    from?: string
  }
  const message = String(body.message ?? "").slice(0, 2000).trim()
  const from = String(body.from ?? "").slice(0, 120).trim()
  if (!message) {
    return NextResponse.json({ error: "message_required" }, { status: 400 })
  }

  try {
    await setMotherDedication(view.gallery.id, message, from || null)
    // La madre escribió desde el link que compartió el estudio → mostrarlo.
    await setMotherDedicationEnabled(view.gallery.id, true)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "save_failed" }, { status: 500 })
  }
}
