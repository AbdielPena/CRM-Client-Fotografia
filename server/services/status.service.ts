import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { throwServiceError } from "@/lib/utils/api-error"

// Las tablas status_* son nuevas y aún no están en los tipos generados;
// usamos un cliente genérico para operar sobre ellas (RLS sigue aplicando).
function db(): SupabaseClient {
  return createSupabaseServerClient() as unknown as SupabaseClient
}

/**
 * Capa de datos del módulo /status (centro de QA / monitoreo).
 * El catálogo de módulos, workflows y sondas vive en `lib/status/catalog.ts`
 * (config estática derivada de la estructura del sistema). Aquí guardamos el
 * ESTADO mutable: checklists, notas, errores, historial de pruebas y auditorías.
 */

export type ErrorPriority = "critica" | "alta" | "media" | "baja"
export type ErrorStatus = "abierto" | "en_revision" | "corregido" | "validado"
export type TestResult = "passed" | "failed" | "partial"

export interface WorkflowState {
  checklist: Record<string, boolean>
  notes: string | null
  lastValidatedAt: string | null
}

export interface StatusError {
  id: string
  title: string
  description: string | null
  module: string | null
  workflowKey: string | null
  priority: ErrorPriority
  status: ErrorStatus
  createdAt: string
  updatedAt: string
}

export interface TestRun {
  id: string
  workflowKey: string | null
  result: TestResult
  notes: string | null
  runByName: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Estado por workflow (checklist + notas + última validación)
// ---------------------------------------------------------------------------

export async function getWorkflowStates(
  studioId: string,
): Promise<Record<string, WorkflowState>> {
  const supabase = db()
  const { data, error } = await supabase
    .from("status_workflow_state")
    .select("workflow_key, checklist, notes, last_validated_at")
    .eq("studio_id", studioId)
  if (error) throwServiceError("STATUS_STATE_FAILED", error, { studioId })

  const out: Record<string, WorkflowState> = {}
  for (const r of (data ?? []) as Array<{
    workflow_key: string
    checklist: Record<string, boolean> | null
    notes: string | null
    last_validated_at: string | null
  }>) {
    out[r.workflow_key] = {
      checklist: (r.checklist as Record<string, boolean>) ?? {},
      notes: r.notes ?? null,
      lastValidatedAt: r.last_validated_at ?? null,
    }
  }
  return out
}

async function getOneState(
  studioId: string,
  workflowKey: string,
): Promise<WorkflowState> {
  const supabase = db()
  const { data } = await supabase
    .from("status_workflow_state")
    .select("checklist, notes, last_validated_at")
    .eq("studio_id", studioId)
    .eq("workflow_key", workflowKey)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any
  return {
    checklist: (r?.checklist as Record<string, boolean>) ?? {},
    notes: r?.notes ?? null,
    lastValidatedAt: r?.last_validated_at ?? null,
  }
}

async function upsertState(
  studioId: string,
  workflowKey: string,
  patch: { checklist?: Record<string, boolean>; notes?: string | null; validatedBy?: string | null; markValidated?: boolean },
): Promise<void> {
  const supabase = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = {
    studio_id: studioId,
    workflow_key: workflowKey,
    updated_at: new Date().toISOString(),
  }
  if (patch.checklist !== undefined) row.checklist = patch.checklist
  if (patch.notes !== undefined) row.notes = patch.notes
  if (patch.markValidated) {
    row.last_validated_at = new Date().toISOString()
    row.validated_by = patch.validatedBy ?? null
  }
  const { error } = await supabase
    .from("status_workflow_state")
    .upsert(row, { onConflict: "studio_id,workflow_key" })
  if (error) throwServiceError("STATUS_STATE_UPSERT_FAILED", error, { studioId, workflowKey })
}

export async function setChecklistItem(
  studioId: string,
  workflowKey: string,
  itemKey: string,
  checked: boolean,
): Promise<void> {
  const current = await getOneState(studioId, workflowKey)
  const checklist = { ...current.checklist, [itemKey]: checked }
  await upsertState(studioId, workflowKey, { checklist })
}

export async function saveWorkflowNotes(
  studioId: string,
  workflowKey: string,
  notes: string,
): Promise<void> {
  await upsertState(studioId, workflowKey, { notes })
}

export async function markWorkflowValidated(
  studioId: string,
  workflowKey: string,
  userId: string | null,
): Promise<void> {
  await upsertState(studioId, workflowKey, { markValidated: true, validatedBy: userId })
}

// ---------------------------------------------------------------------------
// Registro de errores
// ---------------------------------------------------------------------------

export async function listErrors(studioId: string): Promise<StatusError[]> {
  const supabase = db()
  const { data, error } = await supabase
    .from("status_errors")
    .select("id, title, description, module, workflow_key, priority, status, created_at, updated_at")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })
  if (error) throwServiceError("STATUS_ERRORS_FAILED", error, { studioId })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    module: r.module,
    workflowKey: r.workflow_key,
    priority: r.priority,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export async function createError(
  studioId: string,
  userId: string | null,
  input: {
    title: string
    description?: string | null
    module?: string | null
    workflowKey?: string | null
    priority?: ErrorPriority
  },
): Promise<void> {
  const supabase = db()
  const { error } = await supabase.from("status_errors").insert({
    studio_id: studioId,
    title: input.title,
    description: input.description ?? null,
    module: input.module ?? null,
    workflow_key: input.workflowKey ?? null,
    priority: input.priority ?? "media",
    status: "abierto",
    created_by: userId,
  })
  if (error) throwServiceError("STATUS_ERROR_CREATE_FAILED", error, { studioId })
}

export async function updateError(
  studioId: string,
  errorId: string,
  patch: { status?: ErrorStatus; priority?: ErrorPriority; title?: string; description?: string | null; module?: string | null },
): Promise<void> {
  const supabase = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = {}
  if (patch.status !== undefined) row.status = patch.status
  if (patch.priority !== undefined) row.priority = patch.priority
  if (patch.title !== undefined) row.title = patch.title
  if (patch.description !== undefined) row.description = patch.description
  if (patch.module !== undefined) row.module = patch.module
  const { error } = await supabase
    .from("status_errors")
    .update(row)
    .eq("id", errorId)
    .eq("studio_id", studioId)
  if (error) throwServiceError("STATUS_ERROR_UPDATE_FAILED", error, { studioId, errorId })
}

export async function deleteError(studioId: string, errorId: string): Promise<void> {
  const supabase = db()
  const { error } = await supabase
    .from("status_errors")
    .delete()
    .eq("id", errorId)
    .eq("studio_id", studioId)
  if (error) throwServiceError("STATUS_ERROR_DELETE_FAILED", error, { studioId, errorId })
}

// ---------------------------------------------------------------------------
// Historial de pruebas
// ---------------------------------------------------------------------------

export async function listTestRuns(studioId: string, limit = 50): Promise<TestRun[]> {
  const supabase = db()
  const { data, error } = await supabase
    .from("status_test_runs")
    .select("id, workflow_key, result, notes, run_by_name, created_at")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throwServiceError("STATUS_TESTRUNS_FAILED", error, { studioId })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    workflowKey: r.workflow_key,
    result: r.result,
    notes: r.notes,
    runByName: r.run_by_name,
    createdAt: r.created_at,
  }))
}

export async function recordTestRun(
  studioId: string,
  userId: string | null,
  userName: string | null,
  input: { workflowKey?: string | null; result: TestResult; notes?: string | null },
): Promise<void> {
  const supabase = db()
  const { error } = await supabase.from("status_test_runs").insert({
    studio_id: studioId,
    workflow_key: input.workflowKey ?? null,
    result: input.result,
    notes: input.notes ?? null,
    run_by: userId,
    run_by_name: userName,
  })
  if (error) throwServiceError("STATUS_TESTRUN_CREATE_FAILED", error, { studioId })
}

// ---------------------------------------------------------------------------
// Auditorías
// ---------------------------------------------------------------------------

export async function saveAuditRun(
  studioId: string,
  userId: string | null,
  results: unknown,
  summary: unknown,
): Promise<void> {
  const supabase = db()
  const { error } = await supabase.from("status_audit_runs").insert({
    studio_id: studioId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results: results as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary: summary as any,
    created_by: userId,
  })
  if (error) throwServiceError("STATUS_AUDIT_SAVE_FAILED", error, { studioId })
}

export async function getLatestAuditRun(
  studioId: string,
): Promise<{ results: unknown; summary: unknown; createdAt: string } | null> {
  const supabase = db()
  const { data } = await supabase
    .from("status_audit_runs")
    .select("results, summary, created_at")
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any
  if (!r) return null
  return { results: r.results, summary: r.summary, createdAt: r.created_at }
}
