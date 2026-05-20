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
    .from("invoices")
    .select(
      "id, invoice_number, ncf, total, amount_paid, currency, status, due_date, issued_at, sent_at, paid_at, client_id, project_id, created_at, updated_at",
      { count: "exact" },
    )
    .eq("studio_id", auth.studioId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
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
