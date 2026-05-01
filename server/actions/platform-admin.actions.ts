'use server'

import { revalidatePath } from 'next/cache'

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

export async function changeStudioPlanAction(formData: FormData) {
  const ctx = await requirePlatformAdmin()
  const studioId = String(formData.get('studioId') ?? '')
  const planSlugRaw = String(formData.get('planSlug') ?? '')
  const planSlug = planSlugRaw || null

  if (!studioId) throw new Error('studioId requerido')

  await setStudioPlan(studioId, planSlug)

  // void uso — garantiza que no quede ctx sin uso (lint) y deja la
  // posibilidad futura de loggear quién hizo el cambio.
  void ctx.userId

  revalidatePath(`/platform/studios/${studioId}`)
  revalidatePath('/platform/studios')
  revalidatePath('/platform')
}

export async function toggleStudioSuspensionAction(formData: FormData) {
  await requirePlatformAdmin()
  const studioId = String(formData.get('studioId') ?? '')
  const suspend = formData.get('suspend') === '1'
  const reason = (formData.get('reason') as string | null)?.trim() || null

  if (!studioId) throw new Error('studioId requerido')

  await setStudioSuspended(studioId, suspend, reason)

  revalidatePath(`/platform/studios/${studioId}`)
  revalidatePath('/platform/studios')
  revalidatePath('/platform')
}

export async function grantFeatureOverrideAction(formData: FormData) {
  const ctx = await requirePlatformAdmin()
  const studioId = String(formData.get('studioId') ?? '')
  const featureKey = String(formData.get('featureKey') ?? '').trim()
  const isEnabled = formData.get('isEnabled') === '1'
  const limitRaw = String(formData.get('limitValue') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim() || null
  const expires = String(formData.get('expiresAt') ?? '').trim() || null

  if (!studioId) throw new Error('studioId requerido')
  if (!featureKey) throw new Error('featureKey requerido')

  await grantStudioFeatureOverride({
    studioId,
    featureKey,
    isEnabled,
    limitValue: limitRaw ? Number(limitRaw) : null,
    reason,
    expiresAt: expires ? new Date(expires).toISOString() : null,
    grantedBy: ctx.userId,
  })

  revalidatePath(`/platform/studios/${studioId}`)
}

export async function removeFeatureOverrideAction(formData: FormData) {
  await requirePlatformAdmin()
  const overrideId = String(formData.get('overrideId') ?? '')
  const studioId = String(formData.get('studioId') ?? '')
  if (!overrideId) throw new Error('overrideId requerido')

  await removeStudioFeatureOverride(overrideId)

  if (studioId) revalidatePath(`/platform/studios/${studioId}`)
}
