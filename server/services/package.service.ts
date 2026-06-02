import 'server-only'

import slugify from 'slugify'

import { packagesRepo } from '@/server/repositories'
import { throwServiceError } from '@/lib/utils/api-error'
import { createSupabaseServerClient } from '@/server/supabase/server'
import type {
  CreatePackageInput,
  UpdatePackageInput,
} from '@/lib/validations/package.schema'

// Convierte el campo `includes` (string multi-línea) a array jsonb
function parseIncludes(value: string | undefined | null): string[] {
  if (!value) return []
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function buildSlug(name: string): string {
  return slugify(name, { lower: true, strict: true }).slice(0, 80)
}

async function uniqueSlug(studioId: string, base: string): Promise<string> {
  const supabase = createSupabaseServerClient()
  let slug = base
  let suffix = 1
  // Loop bounded — si chocan 10 veces, algo raro pasa
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase
      .from('packages')
      .select('id')
      .eq('studio_id', studioId)
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return slug
    suffix += 1
    slug = `${base}-${suffix}`
  }
  return `${base}-${Date.now()}`
}

export async function getPackages(studioId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('is_active', { ascending: false })
    .order('price', { ascending: true })

  if (error) {
    // Permission denied / RLS / network → degradar gracefully
    // (no romper la página entera por una query secundaria)
    console.error('[getPackages] error', { studioId, error })
    if (error.code === '42501') return [] // permission denied: caller no autenticado
    throw new Error(`No se pudieron cargar los paquetes: ${error.message}`)
  }
  return data ?? []
}

export async function getPackageById(studioId: string, packageId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('id', packageId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error('[getPackageById] error', { studioId, packageId, error })
    if (error.code === '42501') return null
    throw new Error(`No se pudo cargar el paquete: ${error.message}`)
  }
  return data
}

export async function createPackage(studioId: string, data: CreatePackageInput) {
  const explicit = data.slug?.trim() || ''
  const base = explicit || buildSlug(data.name) || 'paquete'
  const slug = await uniqueSlug(studioId, base)

  const insert = {
    studio_id: studioId,
    name: data.name,
    slug,
    description: data.description || null,
    price: data.price,
    currency: (data.currency || 'DOP').toUpperCase(),
    duration_hours: data.durationHours ?? null,
    edited_photos: data.editedPhotos ?? null,
    includes: parseIncludes(data.includes),
    is_active: data.isActive ?? true,
    // "" / null / undefined → null (sin vincular)
    default_contract_template_id: data.contractTemplateId || null,
    default_form_template_id: data.formTemplateId || null,
  }
  // delivery_days aún no está en los tipos generados (columna nueva)
  ;(insert as Record<string, unknown>).delivery_days = data.deliveryDays ?? null
  return packagesRepo.create(insert)
}

export async function updatePackage(
  studioId: string,
  packageId: string,
  data: UpdatePackageInput,
) {
  const existing = await packagesRepo.findById(packageId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('PACKAGE_NOT_FOUND')
  }

  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.description !== undefined)
    patch.description = data.description || null
  if (data.price !== undefined) patch.price = data.price
  if (data.durationHours !== undefined) patch.duration_hours = data.durationHours
  if (data.editedPhotos !== undefined) patch.edited_photos = data.editedPhotos
  if (data.deliveryDays !== undefined) patch.delivery_days = data.deliveryDays ?? null
  if (data.includes !== undefined) patch.includes = parseIncludes(data.includes)
  if (data.isActive !== undefined) patch.is_active = data.isActive
  // Vinculación a plantilla de contrato / formulario. El form siempre envía el
  // select (uuid o "" para desvincular) → normalizamos "" a null.
  if (data.contractTemplateId !== undefined)
    patch.default_contract_template_id = data.contractTemplateId || null
  if (data.formTemplateId !== undefined)
    patch.default_form_template_id = data.formTemplateId || null

  // Slug: si el user lo escribe explícito → usamos su valor (sanitizado).
  // Si cambia el nombre sin slug explícito → regeneramos para mantener SEO-friendly.
  const explicitSlug = data.slug?.trim()
  if (explicitSlug) {
    const sanitized = buildSlug(explicitSlug)
    if (sanitized && sanitized !== existing.slug) {
      patch.slug = await uniqueSlug(studioId, sanitized)
    }
  } else if (data.name && data.name !== existing.name) {
    const base = buildSlug(data.name) || existing.slug
    patch.slug = await uniqueSlug(studioId, base)
  }

  return packagesRepo.update(packageId, patch)
}

export async function deletePackage(studioId: string, packageId: string) {
  const existing = await packagesRepo.findById(packageId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('PACKAGE_NOT_FOUND')
  }
  // Cascade real (SQL function): borra todos los proyectos que usan el
  // paquete, y por cada proyecto cascadea contratos / facturas / pagos
  // / notas / galerías. También cancela booking_requests pendientes y
  // desactiva public_booking_links.
  const { createSupabaseServiceClient } = await import(
    '@/server/supabase/service'
  )
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.rpc('cascade_delete_package', {
    p_package_id: packageId,
    p_studio_id: studioId,
  })
  if (error) {
    if (error.message?.includes('PACKAGE_NOT_FOUND')) {
      throw new Error('PACKAGE_NOT_FOUND')
    }
    throwServiceError("PACKAGE_DELETE_FAILED", error)
  }
}
