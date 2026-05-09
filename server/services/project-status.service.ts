'use server only'

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

/** Cambia el estado de un proyecto (por label). */
export async function setProjectStatus(
  studioId: string,
  projectId: string,
  newStatusLabel: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('projects')
    .update({ status: newStatusLabel, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
}
