'use server'

import { requireStudioAuth } from '@/server/middleware/auth'
import {
  createProjectStatus,
  updateProjectStatus,
  deleteProjectStatus,
  reorderProjectStatuses,
  setProjectStatus,
} from '@/server/services/project-status.service'
import { revalidatePath } from 'next/cache'

export async function createProjectStatusAction(formData: FormData) {
  const session = await requireStudioAuth()
  const label = String(formData.get('label') ?? '').trim()
  const color = String(formData.get('color') ?? '#6b7280')
  if (!label) return { error: 'El nombre es requerido' }
  try {
    const status = await createProjectStatus(session.studioId, label, color)
    revalidatePath('/projects')
    revalidatePath('/settings/project-statuses')
    return { success: true, status }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al crear estado' }
  }
}

export async function updateProjectStatusAction(
  statusId: string,
  formData: FormData,
) {
  const session = await requireStudioAuth()
  const label = String(formData.get('label') ?? '').trim() || undefined
  const color = String(formData.get('color') ?? '').trim() || undefined
  try {
    await updateProjectStatus(session.studioId, statusId, { label, color })
    revalidatePath('/projects')
    revalidatePath('/settings/project-statuses')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al actualizar' }
  }
}

export async function deleteProjectStatusAction(statusId: string) {
  const session = await requireStudioAuth()
  try {
    await deleteProjectStatus(session.studioId, statusId)
    revalidatePath('/projects')
    revalidatePath('/settings/project-statuses')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al eliminar' }
  }
}

export async function reorderProjectStatusesAction(orderedIds: string[]) {
  const session = await requireStudioAuth()
  try {
    await reorderProjectStatuses(session.studioId, orderedIds)
    revalidatePath('/projects')
    revalidatePath('/settings/project-statuses')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al reordenar' }
  }
}

export async function setProjectStatusAction(projectId: string, newStatusLabel: string) {
  const session = await requireStudioAuth()
  try {
    await setProjectStatus(session.studioId, projectId, newStatusLabel)
    revalidatePath('/projects')
    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al cambiar estado' }
  }
}
