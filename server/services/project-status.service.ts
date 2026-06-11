import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import { throwServiceError } from '@/lib/utils/api-error'

export type ProjectStatus = {
  id: string
  studio_id: string
  label: string
  color: string
  position: number
  is_default: boolean
  created_at: string
}

/** Lista todos los estados del studio ordenados por posición. */
export async function getProjectStatuses(studioId: string): Promise<ProjectStatus[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('project_statuses')
    .select('*')
    .eq('studio_id', studioId)
    .order('position', { ascending: true })

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
  return (data ?? []) as ProjectStatus[]
}

/** Crea un nuevo estado personalizado. */
export async function createProjectStatus(
  studioId: string,
  label: string,
  color: string,
): Promise<ProjectStatus> {
  const supabase = createSupabaseServerClient()

  // Posición = max actual + 1
  const { data: maxRow } = await supabase
    .from('project_statuses')
    .select('position')
    .eq('studio_id', studioId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = ((maxRow as { position: number } | null)?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('project_statuses')
    .insert({ studio_id: studioId, label, color, position })
    .select()
    .single()

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
  return data as ProjectStatus
}

/** Actualiza label y/o color de un estado. */
export async function updateProjectStatus(
  studioId: string,
  statusId: string,
  patch: { label?: string; color?: string },
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('project_statuses')
    .update(patch)
    .eq('id', statusId)
    .eq('studio_id', studioId)

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
}

/** Reordena los estados (recibe array de IDs en nuevo orden). */
export async function reorderProjectStatuses(
  studioId: string,
  orderedIds: string[],
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const updates = orderedIds.map((id, idx) =>
    supabase
      .from('project_statuses')
      .update({ position: idx })
      .eq('id', id)
      .eq('studio_id', studioId),
  )
  await Promise.all(updates)
}

/** Elimina un estado. Los proyectos con ese estado quedan con el label como texto. */
export async function deleteProjectStatus(
  studioId: string,
  statusId: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  // No se puede borrar si hay proyectos con ese status; primero verificamos
  const { data: status } = await supabase
    .from('project_statuses')
    .select('label')
    .eq('id', statusId)
    .eq('studio_id', studioId)
    .maybeSingle()

  if (!status) throw new Error('STATUS_NOT_FOUND')

  const label = (status as { label: string }).label
  const { count } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('status', label)
    .is('deleted_at', null)

  if ((count ?? 0) > 0) {
    throw new Error(`Este estado tiene ${count} proyecto(s) activo(s). Muévelos primero.`)
  }

  const { error } = await supabase
    .from('project_statuses')
    .delete()
    .eq('id', statusId)
    .eq('studio_id', studioId)

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
}

/**
 * Cambia el estado de un proyecto (por label).
 *
 * Emite el evento de automatización `project.status_changed` (best-effort) solo
 * si el status realmente cambió. `opts.dispatch:false` lo suprime — lo usa la
 * acción de automatización `update_project_status` para no auto-dispararse en
 * bucle (una regla con trigger status_changed + acción update_project_status).
 */
export async function setProjectStatus(
  studioId: string,
  projectId: string,
  newStatusLabel: string,
  opts?: { dispatch?: boolean },
): Promise<void> {
  const supabase = createSupabaseServerClient()

  // Status previo para el payload from→to del evento.
  const { data: prev } = await supabase
    .from('projects')
    .select('status')
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()
  const fromStatus = (prev as { status: string | null } | null)?.status ?? null

  const { error } = await supabase
    .from('projects')
    .update({ status: newStatusLabel, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)

  if (opts?.dispatch !== false && fromStatus !== newStatusLabel) {
    void (async () => {
      try {
        const { dispatchAutomationEvent } = await import('./automation.service')
        await dispatchAutomationEvent({
          studioId,
          event: 'project.status_changed',
          entityType: 'project',
          entityId: projectId,
          payload: { project_id: projectId, from: fromStatus, to: newStatusLabel },
        })
      } catch (err) {
        console.error('[project-status] dispatch project.status_changed failed', err)
      }
    })()

    // Si el nuevo status indica "proyecto completado" (label normalizado),
    // dispara el email de solicitud de reseña al cliente. Fire-and-forget.
    void (async () => {
      try {
        const { isCompletedStatusLabel, sendReviewRequestEmail } = await import(
          './engagement-feedback.service'
        )
        if (!isCompletedStatusLabel(newStatusLabel)) return
        if (isCompletedStatusLabel(fromStatus)) return // ya estaba completado

        const sb = createSupabaseServiceClient()
        const { data: row } = await sb
          .from('projects')
          .select('client_id')
          .eq('id', projectId)
          .eq('studio_id', studioId)
          .maybeSingle()
        const clientId = (row as { client_id: string | null } | null)?.client_id
        if (!clientId) return
        await sendReviewRequestEmail(studioId, clientId, projectId)
      } catch (err) {
        console.error('[project-status] sendReviewRequestEmail failed', err)
      }
    })()
  }
}
