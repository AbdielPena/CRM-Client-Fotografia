'use server'

import { revalidatePath } from 'next/cache'

import { requireRole } from '@/server/middleware/auth'
import {
  addDomainForStudio,
  removeDomainForStudio,
  setPrimaryDomainForStudio,
  verifyDomain,
} from '@/server/services/domain.service'

/**
 * Actions para que el studio gestione sus dominios desde /settings/domain.
 * Requieren rol admin u owner.
 */

export async function addDomainAction(formData: FormData) {
  const session = await requireRole('admin')
  const raw = String(formData.get('domain') ?? '').trim()
  if (!raw) throw new Error('Dominio requerido')

  await addDomainForStudio(session.studioId, raw, session.userId)
  revalidatePath('/settings/domain')
}

export async function removeDomainAction(formData: FormData) {
  const session = await requireRole('admin')
  const domainId = String(formData.get('domainId') ?? '')
  if (!domainId) throw new Error('domainId requerido')

  await removeDomainForStudio(session.studioId, domainId, session.userId)
  revalidatePath('/settings/domain')
}

export async function verifyDomainAction(formData: FormData) {
  const session = await requireRole('admin')
  const domainId = String(formData.get('domainId') ?? '')
  if (!domainId) throw new Error('domainId requerido')

  await verifyDomain(session.studioId, domainId, session.userId)
  revalidatePath('/settings/domain')
}

export async function setPrimaryDomainAction(formData: FormData) {
  const session = await requireRole('admin')
  const domainId = String(formData.get('domainId') ?? '')
  if (!domainId) throw new Error('domainId requerido')

  await setPrimaryDomainForStudio(session.studioId, domainId, session.userId)
  revalidatePath('/settings/domain')
}
