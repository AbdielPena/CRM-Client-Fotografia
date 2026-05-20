import type { NextRequest } from "next/server"

import {
  apiV1Authenticate,
  apiV1Error,
  apiV1Json,
  paginationFromUrl,
} from "@/lib/api-v1-auth"
import { untypedServer } from "@/server/supabase/untyped"

export async function GET(req: NextRequest) {
  const auth = await apiV1Authenticate(req, "read")
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const { page, pageSize, from, to } = paginationFromUrl(url)
  const status = url.searchParams.get("status")
  const clientId = url.searchParams.get("client_id")

  const sb = untypedServer()
  let query = sb
    .from("projects")
    .select(
      "id, name, event_type, status, event_date, location, total_amount, currency, client_id, created_at, updated_at",
      { count: "exact" },
    )
    .eq("studio_id", auth.studioId)
    .is("deleted_at", null)
    .order("event_date", { ascending: false, nullsFirst: false })
    .range(from, to)

  if (status) query = query.eq("status", status)
  if (clientId) query = query.eq("client_id", clientId)

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

  let payload: {
    name?: string
    client_id?: string
    event_type?: string
    event_date?: string
    location?: string
    total_amount?: number
    currency?: string
  }
  try {
    payload = await req.json()
  } catch {
    return apiV1Error("INVALID_JSON", "Body must be valid JSON", 400)
  }

  if (!payload.name?.trim() || !payload.client_id) {
    return apiV1Error("VALIDATION", "name + client_id are required", 400)
  }

  const sb = untypedServer()
  const { data, error } = await sb
    .from("projects")
    .insert({
      studio_id: auth.studioId,
      name: payload.name.trim(),
      client_id: payload.client_id,
      event_type: payload.event_type ?? null,
      event_date: payload.event_date ?? null,
      location: payload.location ?? null,
      total_amount: payload.total_amount ?? null,
      currency: payload.currency ?? "DOP",
      status: "lead",
    })
    .select("id, name, event_type, event_date, status, created_at")
    .single()

  if (error) return apiV1Error("INSERT_FAILED", error.message)

  return apiV1Json({ data }, { status: 201 })
}
