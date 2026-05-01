import { NextRequest, NextResponse } from "next/server"
import { submitPublicForm } from "@/server/services/form.service"

/**
 * Endpoint público: submit final de un formulario.
 * Valida los datos contra el schema_snapshot. Si fallan, devuelve
 * `{ fieldErrors: { campo: 'mensaje', ... } }` con HTTP 400 para que el
 * cliente pueda renderizar errores inline por campo.
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

    await submitPublicForm(token, data)

    return NextResponse.json({ success: true })
  } catch (error) {
    // Errores de validación traen un .fieldErrors estructurado
    if (
      error instanceof Error &&
      "fieldErrors" in error &&
      (error as { fieldErrors: unknown }).fieldErrors
    ) {
      return NextResponse.json(
        {
          error: "Por favor revisa los campos marcados",
          fieldErrors: (error as { fieldErrors: Record<string, string> }).fieldErrors,
        },
        { status: 400 }
      )
    }

    const message = error instanceof Error ? error.message : "No pudimos enviar el formulario"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
