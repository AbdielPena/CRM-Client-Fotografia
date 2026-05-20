import { NextResponse, type NextRequest } from "next/server"

import {
  tokenHasScope,
  validateApiToken,
} from "@/server/services/api-token.service"
import { untypedServer } from "@/server/supabase/untyped"

/**
 * API pública v1 — endpoint de ejemplo: GET/POST clients.
 *
 * Auth: Header `Authorization: Bearer sf_XXXXXXXXX`
 *
 * Patrón replicable para todos los endpoints v1:
 *   - GET: requiere scope 'read' o superior
 *   - POST/PUT/DELETE: requiere 'write' o 'admin'
 *
 * Responde JSON con shape `{ data: [...], meta: { total, page } }`
 * o `{ error: "CODE", message: "..." }` en caso de error.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req, "read")
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("page_size")) || 50),
  )
  const search = url.searchParams.get("q") ?? undefined

  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("clients")
    .select("id, name, email, phone, created_at, updated_at", {
      count: "exact",
    })
    .eq("studio_id", auth.studioId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .range(from, to)

  if (search) {
    const term = `%${search}%`
    query = query.or(`name.ilike.${term},email.ilike.${term}`)
  }

  const { data, count, error } = await query
  if (error) {
    return NextResponse.json(
      { error: "QUERY_FAILED", message: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({
    data: data ?? [],
    meta: {
      total: count ?? 0,
      page,
      page_size: pageSize,
      total_pages: Math.ceil((count ?? 0) / pageSize) || 1,
    },
  })
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req, "write")
  if (auth.error) return auth.error

  let payload: { name?: string; email?: string; phone?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  if (!payload.name || !payload.name.trim()) {
    return NextResponse.json(
      { error: "VALIDATION", message: "name is required" },
      { status: 400 },
    )
  }

  const sb = untypedServer()
  const { data, error } = await sb
    .from("clients")
    .insert({
      studio_id: auth.studioId,
      name: payload.name.trim(),
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      source: "api",
    })
    .select("id, name, email, phone, created_at")
    .single()

  if (error) {
    return NextResponse.json(
      { error: "INSERT_FAILED", message: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ data }, { status: 201 })
}

// ============================================================================
// Helper: auth + scope
// ============================================================================
async function authenticate(
  req: NextRequest,
  requiredScope: "read" | "write" | "admin",
): Promise<
  | { studioId: string; tokenId: string; error?: undefined }
  | { error: NextResponse }
> {
  const authHeader = req.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(sf_[a-f0-9]+)$/i.exec(authHeader)
  if (!match) {
    return {
      error: NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
        },
        {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" },
        },
      ),
    }
  }

  const token = match[1]
  const result = await validateApiToken(token)
  if (!result) {
    return {
      error: NextResponse.json(
        { error: "INVALID_TOKEN" },
        { status: 401 },
      ),
    }
  }

  if (!tokenHasScope(result.scopes, requiredScope)) {
    return {
      error: NextResponse.json(
        {
          error: "INSUFFICIENT_SCOPE",
          message: `Required scope: ${requiredScope}`,
          token_scopes: result.scopes,
        },
        { status: 403 },
      ),
    }
  }

  return { studioId: result.studioId, tokenId: result.tokenId }
}
