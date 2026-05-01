import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type PackageRow = Database['public']['Tables']['packages']['Row']
type PackageInsert = Database['public']['Tables']['packages']['Insert']
type PackageUpdate = Database['public']['Tables']['packages']['Update']

export type Package = PackageRow

export const packagesRepo = {
  async listActive(studioId: string, opts: RepoOptions = {}): Promise<Package[]> {
    const db = getDb(opts)
    return run(
      db
        .from('packages')
        .select('*')
        .eq('studio_id', studioId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false }),
      'packagesRepo.listActive',
    )
  },

  async findById(id: string, opts: RepoOptions = {}): Promise<Package | null> {
    const db = getDb(opts)
    return runMaybe(
      db.from('packages').select('*').eq('id', id).is('deleted_at', null).single(),
      'packagesRepo.findById',
    )
  },

  /**
   * Lectura pública por slug, usada en /p/[slug]. Usa RLS de public_booking_links.
   */
  async findPublicBySlug(slug: string, opts: RepoOptions = {}): Promise<{
    package: Package
    linkId: string
  } | null> {
    const db = getDb(opts)
    const { data, error } = await db
      .from('public_booking_links')
      .select('id, package:packages(*)')
      .eq('slug', slug)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw new Error(`[packagesRepo.findPublicBySlug] ${error.message}`)
    if (!data || !data.package) return null
    return { package: data.package as Package, linkId: data.id }
  },

  async create(input: PackageInsert, opts: RepoOptions = {}): Promise<Package> {
    const db = getDb(opts)
    return run(db.from('packages').insert(input).select('*').single(), 'packagesRepo.create')
  },

  async update(id: string, input: PackageUpdate, opts: RepoOptions = {}): Promise<Package> {
    const db = getDb(opts)
    return run(
      db.from('packages').update(input).eq('id', id).select('*').single(),
      'packagesRepo.update',
    )
  },

  async softDelete(id: string, opts: RepoOptions = {}): Promise<void> {
    const db = getDb(opts)
    await run(
      db
        .from('packages')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
        .select('id')
        .single(),
      'packagesRepo.softDelete',
    )
  },
}
