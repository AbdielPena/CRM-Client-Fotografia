import { NextResponse } from "next/server"
import { ZodError } from "zod"

/**
 * Helper único para responder errores en route handlers.
 *
 * Asigna status code apropiado:
 *   - 401 si el error es de auth (UNAUTHENTICATED, NO_ACTIVE_STUDIO)
 *   - 403 si es FORBIDDEN o NOT_PLATFORM_ADMIN
 *   - 422 si es ValidationError de Zod
 *   - 404 si el mensaje contiene "no encontrad" / "not found"
 *   - 410 si es FeatureDisabled
 *   - 400 fallback
 *
 * Loggea siempre con el contexto que reciba.
 */
export function apiError(err: unknown, context?: string): NextResponse {
  const log = (status: number, msg: string) => {
    const prefix = context ? `[${context}]` : "[apiError]"
    console.error(`${prefix} ${status} ${msg}`)
    // Si el error trae más info (Supabase error: code/details/hint), volcar todo
    if (err && typeof err === "object" && !(err instanceof Error)) {
      try {
        console.error(`${prefix} payload:`, JSON.stringify(err, null, 2))
      } catch {
        console.error(`${prefix} payload (no-serializable):`, err)
      }
    }
    if (err instanceof Error && err.stack && status >= 500) {
      console.error(err.stack)
    }
  }

  if (err instanceof ZodError) {
    const flat = err.flatten()
    log(422, "validation")
    return NextResponse.json(
      { error: "Validación falló", issues: flat.fieldErrors },
      { status: 422 },
    )
  }

  // Extraer mensaje útil incluso si el error no es Error (ej: Supabase devuelve
  // objetos planos { message, code, details, hint }).
  let msg: string
  if (err instanceof Error) {
    msg = err.message
  } else if (err && typeof err === "object" && "message" in err) {
    msg = String((err as { message: unknown }).message)
  } else {
    msg = String(err)
  }

  if (msg === "UNAUTHENTICATED" || msg === "NO_ACTIVE_STUDIO") {
    log(401, msg)
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  if (msg === "FORBIDDEN" || msg === "NOT_PLATFORM_ADMIN") {
    log(403, msg)
    return NextResponse.json({ error: msg }, { status: 403 })
  }

  const lower = msg.toLowerCase()
  if (
    lower.includes("no encontrad") ||
    lower.includes("not found") ||
    lower === "token inválido"
  ) {
    log(404, msg)
    return NextResponse.json({ error: msg }, { status: 404 })
  }

  if (
    lower.includes("disabled") ||
    lower.includes("deshabilitad")
  ) {
    log(410, msg)
    return NextResponse.json({ error: msg }, { status: 410 })
  }

  log(400, msg)
  return NextResponse.json({ error: msg }, { status: 400 })
}
