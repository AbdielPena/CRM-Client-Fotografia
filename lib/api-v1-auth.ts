import { NextResponse, type NextRequest } from "next/server"

import {
  tokenHasScope,
  validateApiToken,
  type ApiTokenScope,
} from "@/server/services/api-token.service"

/**
 * Helper compartido para autenticar y validar scope en endpoints /api/v1/*.
 *
 * Uso:
 *   const auth = await apiV1Authenticate(req, "read")
 *   if (auth.error) return auth.error
 *   // ... use auth.studioId / auth.tokenId
 */
export async function apiV1Authenticate(
  req: NextRequest,
  requiredScope: ApiTokenScope,
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
      error: NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 }),
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

export function apiV1Json<T>(
  data: T,
  init?: ResponseInit,
): NextResponse<T> {
  return NextResponse.json(data, init)
}

export function apiV1Error(
  code: string,
  message: string,
  status = 500,
): NextResponse {
  return NextResponse.json({ error: code, message }, { status })
}

/**
 * Parse pagination params: ?page=1&page_size=50 (max 100).
 */
export function paginationFromUrl(url: URL): { page: number; pageSize: number; from: number; to: number } {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("page_size")) || 50),
  )
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { page, pageSize, from, to }
}
