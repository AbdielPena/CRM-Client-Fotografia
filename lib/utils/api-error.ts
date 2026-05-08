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

// ============================================================================
// serviceError: helper para services. Loguea el error completo (con detalles
// de Postgres) en server, pero re-lanza un Error con código semántico que
// el caller (action / route handler) puede mapear a UI sin filtrar internals.
//
// Uso:
//   const { error } = await supabase.from('clients').insert(...)
//   if (error) throwServiceError('CLIENT_CREATE_FAILED', error, { studioId })
//
// El caller atrapa con catch (err) { ... err.message es 'CLIENT_CREATE_FAILED' }
// y puede hacer un switch para traducir a mensajes user-facing.
// ============================================================================

type ServiceErrorContext = Record<string, unknown> | undefined

/**
 * Lanza un Error con código semántico, loguea el detalle real server-side.
 * NUNCA usa el `error.message` de Postgres como mensaje del Error final
 * — eso filtraba constraints, schemas, hints al cliente.
 */
export function throwServiceError(
  code: string,
  cause: unknown,
  context?: ServiceErrorContext,
): never {
  const ctxStr = context ? ` ${JSON.stringify(context)}` : ""
  if (cause && typeof cause === "object") {
    const c = cause as {
      message?: string
      code?: string
      details?: string
      hint?: string
    }
    console.error(
      `[service:${code}]${ctxStr} ${c.code ?? ""} ${c.message ?? ""} ${c.details ?? ""} ${c.hint ?? ""}`.trim(),
    )
  } else {
    console.error(`[service:${code}]${ctxStr}`, cause)
  }

  // Lanza solo el código semántico — el mensaje crudo NO sale del server.
  throw new Error(code)
}

/**
 * Variante para errors de Supabase específicamente — detecta códigos comunes
 * y los mapea a códigos semánticos.
 *
 * Códigos PG relevantes:
 *   23505 → unique_violation       → 'DUPLICATE'
 *   23503 → foreign_key_violation  → 'FK_VIOLATION'
 *   23502 → not_null_violation     → 'MISSING_FIELD'
 *   23514 → check_violation        → 'CONSTRAINT_FAILED'
 *   42501 → insufficient_privilege → 'FORBIDDEN'
 *   PGRST116 → not found
 */
export function throwSupabaseError(
  fallbackCode: string,
  error: { code?: string; message?: string; details?: string; hint?: string },
  context?: ServiceErrorContext,
): never {
  let semanticCode = fallbackCode
  if (error.code === "23505") semanticCode = "DUPLICATE"
  else if (error.code === "23503") semanticCode = "FK_VIOLATION"
  else if (error.code === "23502") semanticCode = "MISSING_FIELD"
  else if (error.code === "23514") semanticCode = "CONSTRAINT_FAILED"
  else if (error.code === "42501") semanticCode = "FORBIDDEN"
  else if (error.code === "PGRST116") semanticCode = "NOT_FOUND"

  throwServiceError(semanticCode, error, context)
}
