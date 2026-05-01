import { NextRequest, NextResponse } from "next/server"
import { saveFormProgress } from "@/server/services/form.service"

/**
 * Endpoint público: guardar avance parcial de un formulario.
 * Se llama desde el botón "Guardar avance" en el form público.
 * No valida el schema — permite guardar datos incompletos.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token: string | undefined = body?.token
    const data: Record<string, unknown> | undefined = body?.data

    if (!token) {
      return NextResponse.json(
        { error: "Token requerido" },
        { status: 400 }
      )
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json(
        { error: "Datos inválidos" },
        { status: 400 }
      )
    }

    await saveFormProgress(token, data)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "No pudimos guardar el avance"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
