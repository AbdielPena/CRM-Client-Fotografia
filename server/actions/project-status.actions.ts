'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireStudioAuth } from '@/server/middleware/auth'
import {
  createProjectStatus,
  updateProjectStatus,
  deleteProjectStatus,
  reorderProjectStatuses,
  setProjectStatus,
} from '@/server/services/project-status.service'

// ─── Validation schemas ─────────────────────────────────────────────────────

const uuidSchema = z.string().uuid('ID inválido')

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido (debe ser hex #RRGGBB)')

const labelSchema = z
  .string()
  .trim()
  .min(1, 'El nombre es requerido')
  .max(60, 'Nombre demasiado largo')

const createProjectStatusSchema = z.object({
  label: labelSchema,
  color: hexColorSchema.default('#6b7280'),
})

const autoIntentSchema = z.enum([
  'consulta',
  'reservado',
  'sesion_realizada',
  'esperando_seleccion',
  'edicion',
  'entregado',
])

const updateProjectStatusSchema = z.object({
  label: labelSchema.optional(),
  color: hexColorSchema.optional(),
  autoIntent: autoIntentSchema.nullable().optional(),
})

const reorderSchema = z.object({
  orderedIds: z.array(uuidSchema).min(1, 'Debe haber al menos un estado'),
})

const setStatusSchema = z.object({
  projectId: uuidSchema,
  newStatusLabel: labelSchema,
})

export async function createProjectStatusAction(formData: FormData) {
  const session = await requireStudioAuth()

  const rawColor = String(formData.get('color') ?? '#6b7280')
  const parseRes = createProjectStatusSchema.safeParse({
    label: String(formData.get('label') ?? ''),
    color: rawColor,
  })
  if (!parseRes.success) {
    const first = parseRes.error.issues[0]
    return { error: first?.message ?? 'Datos inválidos' }
  }
  const data = parseRes.data

  try {
    const status = await createProjectStatus(session.studioId, data.label, data.color)
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
  const validStatusId = uuidSchema.parse(statusId)

  const rawLabel = String(formData.get('label') ?? '').trim()
  const rawColor = String(formData.get('color') ?? '').trim()
  const rawIntent = formData.get('autoIntent') // null si no vino; '' = quitar intent

  const raw: { label?: string; color?: string; autoIntent?: string | null } = {}
  if (rawLabel) raw.label = rawLabel
  if (rawColor) raw.color = rawColor
  if (rawIntent !== null) raw.autoIntent = String(rawIntent).trim() || null

  const parseRes = updateProjectStatusSchema.safeParse(raw)
  if (!parseRes.success) {
    const first = parseRes.error.issues[0]
    return { error: first?.message ?? 'Datos inválidos' }
  }
  const data = parseRes.data

  try {
    await updateProjectStatus(session.studioId, validStatusId, data)
    revalidatePath('/projects')
    revalidatePath('/settings/project-statuses')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al actualizar' }
  }
}

export async function deleteProjectStatusAction(statusId: string) {
  const session = await requireStudioAuth()
  const validStatusId = uuidSchema.parse(statusId)

  try {
    await deleteProjectStatus(session.studioId, validStatusId)
    revalidatePath('/projects')
    revalidatePath('/settings/project-statuses')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al eliminar' }
  }
}

export async function reorderProjectStatusesAction(orderedIds: string[]) {
  const session = await requireStudioAuth()
  const data = reorderSchema.parse({ orderedIds })

  try {
    await reorderProjectStatuses(session.studioId, data.orderedIds)
    revalidatePath('/projects')
    revalidatePath('/settings/project-statuses')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al reordenar' }
  }
}

export async function setProjectStatusAction(projectId: string, newStatusLabel: string) {
  const session = await requireStudioAuth()
  const data = setStatusSchema.parse({ projectId, newStatusLabel })

  try {
    await setProjectStatus(session.studioId, data.projectId, data.newStatusLabel)
    revalidatePath('/projects')
    revalidatePath(`/projects/${data.projectId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al cambiar estado' }
  }
}
