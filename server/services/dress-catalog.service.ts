import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/server/supabase/service'

/**
 * Catálogo de vestidos por tienda (precio de renta PRIVADO — solo admin).
 * Acceso 100% service-role; nunca se expone en endpoints públicos.
 * El precio se cruza con las selecciones del cliente por `image_url`.
 */

function db(): SupabaseClient {
  return createSupabaseServiceClient() as unknown as SupabaseClient
}

export type DressStore = {
  id: string
  name: string
  contact_whatsapp: string | null
  notes: string | null
  dress_count: number
}

export type Dress = {
  id: string
  store_id: string
  store_name: string | null
  name: string
  collection: string | null
  image_url: string | null
  rental_price: number | null
  deposit: number | null
  currency: string
  notes: string | null
  is_active: boolean
}

// ── Tiendas ──────────────────────────────────────────────────────────────────
export async function getDressStores(studioId: string): Promise<DressStore[]> {
  const sb = db()
  const { data: stores } = await sb
    .from('dress_stores')
    .select('id, name, contact_whatsapp, notes')
    .eq('studio_id', studioId)
    .order('name')
  const { data: counts } = await sb
    .from('dress_catalog')
    .select('store_id')
    .eq('studio_id', studioId)
  const byStore = new Map<string, number>()
  for (const r of (counts ?? []) as Array<{ store_id: string }>) {
    byStore.set(r.store_id, (byStore.get(r.store_id) ?? 0) + 1)
  }
  return ((stores ?? []) as Array<Omit<DressStore, 'dress_count'>>).map((s) => ({
    ...s,
    dress_count: byStore.get(s.id) ?? 0,
  }))
}

export async function createDressStore(
  studioId: string,
  input: { name: string; contactWhatsapp?: string | null; notes?: string | null },
): Promise<{ id: string }> {
  const { data, error } = await db()
    .from('dress_stores')
    .insert({
      studio_id: studioId,
      name: input.name.trim(),
      contact_whatsapp: input.contactWhatsapp?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data as { id: string }
}

export async function updateDressStore(
  studioId: string,
  id: string,
  input: { name?: string; contactWhatsapp?: string | null; notes?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.contactWhatsapp !== undefined)
    patch.contact_whatsapp = input.contactWhatsapp?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  const { error } = await db()
    .from('dress_stores')
    .update(patch)
    .eq('id', id)
    .eq('studio_id', studioId)
  if (error) throw new Error(error.message)
}

export async function deleteDressStore(studioId: string, id: string): Promise<void> {
  // CASCADE borra los vestidos de la tienda.
  const { error } = await db()
    .from('dress_stores')
    .delete()
    .eq('id', id)
    .eq('studio_id', studioId)
  if (error) throw new Error(error.message)
}

// ── Vestidos ─────────────────────────────────────────────────────────────────
export async function getDressCatalog(studioId: string): Promise<Dress[]> {
  const sb = db()
  const { data } = await sb
    .from('dress_catalog')
    .select(
      'id, store_id, name, collection, image_url, rental_price, deposit, currency, notes, is_active, dress_stores(name)',
    )
    .eq('studio_id', studioId)
    .order('collection')
    .order('name')
  return ((data ?? []) as Array<Record<string, unknown>>).map((d) => ({
    id: d.id as string,
    store_id: d.store_id as string,
    store_name: (d.dress_stores as { name?: string } | null)?.name ?? null,
    name: d.name as string,
    collection: (d.collection as string | null) ?? null,
    image_url: (d.image_url as string | null) ?? null,
    rental_price: d.rental_price != null ? Number(d.rental_price) : null,
    deposit: d.deposit != null ? Number(d.deposit) : null,
    currency: (d.currency as string) ?? 'DOP',
    notes: (d.notes as string | null) ?? null,
    is_active: Boolean(d.is_active),
  }))
}

export type DressInput = {
  storeId: string
  name: string
  collection?: string | null
  imageUrl?: string | null
  rentalPrice?: number | null
  deposit?: number | null
  notes?: string | null
  isActive?: boolean
}

export async function createDress(
  studioId: string,
  input: DressInput,
): Promise<{ id: string }> {
  const { data, error } = await db()
    .from('dress_catalog')
    .insert({
      studio_id: studioId,
      store_id: input.storeId,
      name: input.name.trim(),
      collection: input.collection?.trim() || null,
      image_url: input.imageUrl?.trim() || null,
      rental_price: input.rentalPrice ?? null,
      deposit: input.deposit ?? null,
      notes: input.notes?.trim() || null,
      is_active: input.isActive ?? true,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data as { id: string }
}

export async function updateDress(
  studioId: string,
  id: string,
  input: Partial<DressInput>,
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.storeId !== undefined) patch.store_id = input.storeId
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.collection !== undefined) patch.collection = input.collection?.trim() || null
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl?.trim() || null
  if (input.rentalPrice !== undefined) patch.rental_price = input.rentalPrice ?? null
  if (input.deposit !== undefined) patch.deposit = input.deposit ?? null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  if (input.isActive !== undefined) patch.is_active = input.isActive
  const { error } = await db()
    .from('dress_catalog')
    .update(patch)
    .eq('id', id)
    .eq('studio_id', studioId)
  if (error) throw new Error(error.message)
}

export async function deleteDress(studioId: string, id: string): Promise<void> {
  const { error } = await db()
    .from('dress_catalog')
    .delete()
    .eq('id', id)
    .eq('studio_id', studioId)
  if (error) throw new Error(error.message)
}

// ── Selecciones del cliente CON precio (admin) ───────────────────────────────
export type SelectionDress = {
  name: string
  image: string | null
  rentalPrice: number | null
  deposit: number | null
}
export type SelectionWithPrices = {
  token: string
  clientName: string
  clientWhatsapp: string | null
  tentativeDate: string | null
  planInterest: string | null
  createdAt: string
  dresses: SelectionDress[]
  totalRental: number
  totalDeposit: number
  matched: number
}

export async function getSelectionsWithPrices(
  studioId: string,
): Promise<SelectionWithPrices[]> {
  const sb = db()
  const [{ data: sels }, { data: cat }] = await Promise.all([
    sb
      .from('dress_selections')
      .select('token, client_name, client_whatsapp, tentative_date, plan_interest, dresses, created_at')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false }),
    sb
      .from('dress_catalog')
      .select('image_url, name, rental_price, deposit')
      .eq('studio_id', studioId),
  ])

  // índice por image_url para cruzar el precio (la selección guarda la misma URL)
  const priceByImage = new Map<string, { name: string; rental: number | null; deposit: number | null }>()
  for (const d of (cat ?? []) as Array<{ image_url: string | null; name: string; rental_price: unknown; deposit: unknown }>) {
    if (d.image_url)
      priceByImage.set(d.image_url, {
        name: d.name,
        rental: d.rental_price != null ? Number(d.rental_price) : null,
        deposit: d.deposit != null ? Number(d.deposit) : null,
      })
  }

  return ((sels ?? []) as Array<Record<string, unknown>>).map((s) => {
    const raw = Array.isArray(s.dresses) ? (s.dresses as Array<{ name?: string; image?: string }>) : []
    let totalRental = 0
    let totalDeposit = 0
    let matched = 0
    const dresses: SelectionDress[] = raw.map((d) => {
      const hit = d.image ? priceByImage.get(d.image) : undefined
      if (hit) {
        matched++
        if (hit.rental) totalRental += hit.rental
        if (hit.deposit) totalDeposit += hit.deposit
      }
      return {
        name: hit?.name || d.name || 'Vestido',
        image: d.image ?? null,
        rentalPrice: hit?.rental ?? null,
        deposit: hit?.deposit ?? null,
      }
    })
    return {
      token: s.token as string,
      clientName: s.client_name as string,
      clientWhatsapp: (s.client_whatsapp as string | null) ?? null,
      tentativeDate: (s.tentative_date as string | null) ?? null,
      planInterest: (s.plan_interest as string | null) ?? null,
      createdAt: s.created_at as string,
      dresses,
      totalRental,
      totalDeposit,
      matched,
    }
  })
}
