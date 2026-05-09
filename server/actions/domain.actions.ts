'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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

// ─── Validation schemas ─────────────────────────────────────────────────────

const uuidSchema = z.string().uuid('ID inválido')

// Dominios: hasta 253 caracteres, etiquetas separadas por punto.
// La validación más estricta vive en domain.service (isValidDomain).
const domainSchema = z
  .string()
  .trim()
  .min(1, 'Dominio requerido')
  .max(253, 'Dominio demasiado largo')

const addDomainSchema = z.object({
  domain: domainSchema,
})

const domainIdSchema = z.object({
  domainId: uuidSchema,
})

export async function addDomainAction(formData: FormData) {
  const session = await requireRole('admin')
  const { domain } = addDomainSchema.parse({
    domain: String(formData.get('domain') ?? ''),
  })

  await addDomainForStudio(session.studioId, domain, session.userId)
  revalidatePath('/settings/domain')
}

export async function removeDomainAction(formData: FormData) {
  const session = await requireRole('admin')
  const { domainId } = domainIdSchema.parse({
    domainId: String(formData.get('domainId') ?? ''),
  })

  await removeDomainForStudio(session.studioId, domainId, session.userId)
  revalidatePath('/settings/domain')
}

export async function verifyDomainAction(formData: FormData) {
  const session = await requireRole('admin')
  const { domainId } = domainIdSchema.parse({
    domainId: String(formData.get('domainId') ?? ''),
  })

  await verifyDomain(session.studioId, domainId, session.userId)
  revalidatePath('/settings/domain')
}

export async function setPrimaryDomainAction(formData: FormData) {
  const session = await requireRole('admin')
  const { domainId } = domainIdSchema.parse({
    domainId: String(formData.get('domainId') ?? ''),
  })

  await setPrimaryDomainForStudio(session.studioId, domainId, session.userId)
  revalidatePath('/settings/domain')
}
