import "server-only"

import { NextResponse, type NextRequest } from "next/server"

import { apiV1Authenticate } from "@/lib/api-v1-auth"
import type { ApiTokenScope } from "@/server/services/api-token.service"

export type ApiAuth = { studioId: string; tokenId: string }

/**
 * Adaptador ergonómico sobre `apiV1Authenticate` (el helper canónico de
 * `/api/v1`). Devuelve el `ApiAuth` o una `NextResponse` de error que el
 * handler retorna tal cual:
 *
 *   const auth = await requireApiToken(req, "write")
 *   if (auth instanceof NextResponse) return auth
 *   // auth.studioId disponible
 *
 * La validación real (Bearer sf_…, scopes, expiración/revocación) vive en
 * `lib/api-v1-auth.ts` — aquí solo se normaliza la forma de retorno.
 */
export async function requireApiToken(
  req: NextRequest,
  scope: ApiTokenScope = "read",
): Promise<ApiAuth | NextResponse> {
  const r = await apiV1Authenticate(req, scope)
  if (r.error) return r.error
  return { studioId: r.studioId, tokenId: r.tokenId }
}
