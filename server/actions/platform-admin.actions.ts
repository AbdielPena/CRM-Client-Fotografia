'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePlatformAdmin } from '@/server/supabase/auth-context'
import {
  setStudioPlan,
  setStudioSuspended,
  grantStudioFeatureOverride,
  removeStudioFeatureOverride,
} from '@/server/services/platform-admin.service'

/**
 * Todas estas actions requieren requirePlatformAdmin(). Si el usuario
 * no es super admin, lanza NOT_PLATFORM_ADMIN.
 */

const uuidSchema = z.string().uuid('ID inválido')
// Slug de plan: lowercase, kebab-case, max 40 chars
const planSlugSchema = z
  .string()
  .regex(/^[a-z0-9](-?[a-z0-9])*$/, 'Slug de plan inválido')
  .max(40)
// FeatureKey: snake_case ASCII, max 60
const featureKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'Feature key debe ser snake_case ASCII')
  .max(60)

const changePlanSchema = z.object({
  studioId: uuidSchema,
  planSlug: planSlugSchema.nullable(),
})

const suspensionSchema = z.object({
  studioId: uuidSchema,
  suspend: z.boolean(),
  reason: z.string().max(500).nullable(),
})

const featureOverrideSchema = z.object({
  studioId: uuidSchema,
  featureKey: featureKeySchema,
  isEnabled: z.boolean(),
  limitValue: z.number().int().min(0).max(1_000_000).nullable(),
  reason: z.string().max(500).nullable(),
  expiresAt: z.string().datetime().nullable(),
})

const removeOverrideSchema = z.object({
  overrideId: uuidSchema,
  studioId: uuidSchema.optional(),
})

export async function changeStudioPlanAction(formData: FormData) {
  const ctx = await requirePlatformAdmin()
  const planSlugRaw = String(formData.get('planSlug') ?? '').trim()
  const data = changePlanSchema.parse({
    studioId: String(formData.get('studioId') ?? ''),
    planSlug: planSlugRaw || null,
  })

  await setStudioPlan(data.studioId, data.planSlug)
  void ctx.userId

  revalidatePath(`/platform/studios/${data.studioId}`)
  revalidatePath('/platform/studios')
  revalidatePath('/platform')
}

export async function toggleStudioSuspensionAction(formData: FormData) {
  await requirePlatformAdmin()
  const reasonRaw = (formData.get('reason') as string | null)?.trim() || null
  const data = suspensionSchema.parse({
    studioId: String(formData.get('studioId') ?? ''),
    suspend: formData.get('suspend') === '1',
    reason: reasonRaw,
  })

  await setStudioSuspended(data.studioId, data.suspend, data.reason)

  revalidatePath(`/platform/studios/${data.studioId}`)
  revalidatePath('/platform/studios')
  revalidatePath('/platform')
}

export async function grantFeatureOverrideAction(formData: FormData) {
  const ctx = await requirePlatformAdmin()

  const limitRaw = String(formData.get('limitValue') ?? '').trim()
  const expiresRaw = String(formData.get('expiresAt') ?? '').trim()
  const data = featureOverrideSchema.parse({
    studioId: String(formData.get('studioId') ?? ''),
    featureKey: String(formData.get('featureKey') ?? '').trim(),
    isEnabled: formData.get('isEnabled') === '1',
    limitValue: limitRaw ? Number(limitRaw) : null,
    reason: String(formData.get('reason') ?? '').trim() || null,
    expiresAt: expiresRaw ? new Date(expiresRaw).toISOString() : null,
  })

  await grantStudioFeatureOverride({
    ...data,
    grantedBy: ctx.userId,
  })

  revalidatePath(`/platform/studios/${data.studioId}`)
}

export async function removeFeatureOverrideAction(formData: FormData) {
  await requirePlatformAdmin()
  const studioIdRaw = String(formData.get('studioId') ?? '')
  const data = removeOverrideSchema.parse({
    overrideId: String(formData.get('overrideId') ?? ''),
    studioId: studioIdRaw || undefined,
  })

  await removeStudioFeatureOverride(data.overrideId)

  if (data.studioId) revalidatePath(`/platform/studios/${data.studioId}`)
}
