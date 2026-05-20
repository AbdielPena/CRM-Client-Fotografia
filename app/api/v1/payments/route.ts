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
  const invoiceId = url.searchParams.get("invoice_id")
  const fromDate = url.searchParams.get("from_date")
  const toDate = url.searchParams.get("to_date")

  const sb = untypedServer()
  let query = sb
    .from("payments")
    .select(
      "id, amount, currency, method, status, transaction_reference, received_at, confirmed_at, invoice_id, project_id, client_id, created_at",
      { count: "exact" },
    )
    .eq("studio_id", auth.studioId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("received_at", { ascending: false, nullsFirst: false })
    .range(from, to)

  if (invoiceId) query = query.eq("invoice_id", invoiceId)
  if (fromDate) query = query.gte("received_at", fromDate)
  if (toDate) query = query.lte("received_at", toDate)

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
