import type { NextRequest } from "next/server"

import {
  apiV1Authenticate,
  apiV1Error,
  apiV1Json,
  paginationFromUrl,
} from "@/lib/api-v1-auth"
import { untypedServer } from "@/server/supabase/untyped"
import { createTask, type TaskPriority } from "@/server/services/task.service"

export async function GET(req: NextRequest) {
  const auth = await apiV1Authenticate(req, "read")
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const { page, pageSize, from, to } = paginationFromUrl(url)
  const status = url.searchParams.get("status")
  const assignee = url.searchParams.get("assignee_id")

  const sb = untypedServer()
  let query = sb
    .from("tasks")
    .select(
      "id, title, description, status, priority, due_date, due_time, assigned_to_user_id, entity_type, entity_id, tags, created_at, updated_at",
      { count: "exact" },
    )
    .eq("studio_id", auth.studioId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .range(from, to)

  if (status) query = query.eq("status", status)
  if (assignee) query = query.eq("assigned_to_user_id", assignee)

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
    title?: string
    description?: string
    assigned_to_user_id?: string
    due_date?: string
    priority?: TaskPriority
    entity_type?: string
    entity_id?: string
    tags?: string[]
  }
  try {
    payload = await req.json()
  } catch {
    return apiV1Error("INVALID_JSON", "Body must be valid JSON", 400)
  }

  if (!payload.title?.trim()) {
    return apiV1Error("VALIDATION", "title is required", 400)
  }

  try {
    const task = await createTask(auth.studioId, "api", {
      title: payload.title,
      description: payload.description,
      assignedToUserId: payload.assigned_to_user_id,
      dueDate: payload.due_date,
      priority: payload.priority,
      tags: payload.tags,
      entityType: payload.entity_type,
      entityId: payload.entity_id,
      notifyAssignee: true,
    })
    return apiV1Json({ data: task }, { status: 201 })
  } catch (err) {
    return apiV1Error(
      "CREATE_FAILED",
      err instanceof Error ? err.message : "Unknown",
    )
  }
}
