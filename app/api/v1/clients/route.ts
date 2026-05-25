import type { NextRequest } from "next/server"

import {
  apiV1Authenticate,
  apiV1Error,
  apiV1Json,
  paginationFromUrl,
} from "@/lib/api-v1-auth"
import { untypedServer } from "@/server/supabase/untyped"

/**
 * GET/POST /api/v1/clients
 */
export async function GET(req: NextRequest) {
  const auth = await apiV1Authenticate(req, "read")
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const { page, pageSize, from, to } = paginationFromUrl(url)
  const search = url.searchParams.get("q") ?? undefined

  const sb = untypedServer()
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
  if (error) return apiV1Error("QUERY_FAILED", error.message)

  return apiV1Json({
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
  const auth = await apiV1Authenticate(req, "write")
  if (auth.error) return auth.error

  let payload: { name?: string; email?: string; phone?: string }
  try {
    payload = await req.json()
  } catch {
    return apiV1Error("INVALID_JSON", "Body must be valid JSON", 400)
  }

  if (!payload.name?.trim()) {
    return apiV1Error("VALIDATION", "name is required", 400)
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

  if (error) return apiV1Error("INSERT_FAILED", error.message)

  return apiV1Json({ data }, { status: 201 })
}
