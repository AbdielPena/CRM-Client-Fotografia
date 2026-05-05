import 'server-only'

import { promises as dns } from 'dns'

import type { Database } from '@/types/supabase'
import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import { logActivity } from '@/server/services/activity.service'

/**
 * Dominios custom por studio (Fase 5.5).
 *
 * Flujo:
 * 1. Usuario añade dominio (ej. reservas.mistudio.com) → row con status=pending
 *    y verification_token generado por la DB.
 * 2. Mostramos instrucciones DNS: crear registro TXT en `_studioflow-verify.<domain>`
 *    con valor = verification_token. Y CNAME apuntando a dns_target.
 * 3. Usuario presiona "Verificar" → dns.resolveTxt() busca el TXT y compara.
 *    Si hace match, marca status=active y verified_at=now().
 * 4. En producción, se resuelve el studio por host en middleware/layout.
 */

export type DomainType = 'subdomain' | 'custom'
export type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed' | 'disabled'

export type StudioDomain = {
  id: string
  studioId: string
  domain: string
  type: DomainType
  status: DomainStatus
  isPrimary: boolean
  dnsTarget: string | null
  verificationToken: string
  verificationMethod: string
  verifiedAt: string | null
  sslStatus: string | null
  lastCheckAt: string | null
  lastError: string | null
  createdAt: string
}

// DNS target al que el cliente debe apuntar su CNAME / A record
const DEFAULT_DNS_TARGET = process.env.STUDIOFLOW_DNS_TARGET ?? 'cname.studioflow.app'

export function getDnsInstructions(domain: StudioDomain) {
  return {
    txtHost: `_studioflow-verify.${domain.domain}`,
    txtValue: domain.verificationToken,
    cnameHost: domain.domain,
    cnameTarget: domain.dnsTarget ?? DEFAULT_DNS_TARGET,
  }
}

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

function isValidDomain(d: string): boolean {
  // Dominio válido simple (no valida TLD registrados, solo estructura)
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d)
}

type StudioDomainRow = Database['public']['Tables']['studio_domains']['Row']

function mapRow(row: StudioDomainRow | null): StudioDomain {
  if (!row) {
    throw new Error('STUDIO_DOMAIN_ROW_MISSING')
  }
  // Type narrowing — desde aquí row no es null
  return {
    id: row.id,
    studioId: row.studio_id,
    domain: row.domain,
    type: row.type as StudioDomain['type'],
    status: row.status as StudioDomain['status'],
    isPrimary: !!row.is_primary,
    dnsTarget: row.dns_target,
    verificationToken: row.verification_token,
    verificationMethod: row.verification_method as StudioDomain['verificationMethod'],
    verifiedAt: row.verified_at,
    sslStatus: row.ssl_status as StudioDomain['sslStatus'],
    lastCheckAt: row.last_check_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  }
}

/**
 * Listar dominios de un studio (usado por la UI del studio).
 */
export async function listDomainsForStudio(studioId: string): Promise<StudioDomain[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('studio_domains')
    .select('*')
    .eq('studio_id', studioId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRow)
}

/**
 * Listar TODOS los dominios (solo super admin).
 */
export async function listAllDomains(opts?: {
  status?: DomainStatus | null
  search?: string
}): Promise<Array<StudioDomain & { studioName: string; studioSlug: string }>> {
  const supabase = createSupabaseServiceClient()

  let query = supabase
    .from('studio_domains')
    .select('*, studios(name, slug)')
    .order('created_at', { ascending: false })

  if (opts?.status) query = query.eq('status', opts.status)
  if (opts?.search) query = query.ilike('domain', `%${opts.search}%`)

  const { data, error } = await query.limit(500)
  if (error) throw error

  return (data ?? []).map((row: any) => ({
    ...mapRow(row),
    studioName: row.studios?.name ?? '—',
    studioSlug: row.studios?.slug ?? '',
  }))
}

/**
 * Crear un dominio (status=pending). Genera verification_token en la DB.
 * Lanza si el dominio ya existe globalmente.
 */
export async function addDomainForStudio(
  studioId: string,
  rawDomain: string,
  actorUserId?: string | null,
): Promise<StudioDomain> {
  const domain = normalizeDomain(rawDomain)
  if (!domain) throw new Error('Dominio vacío')
  if (!isValidDomain(domain)) throw new Error('Dominio inválido')

  const supabase = createSupabaseServerClient()

  // Detectar tipo: si termina con el dominio raíz de la app = subdominio
  const rootDomain = (process.env.STUDIOFLOW_ROOT_DOMAIN ?? 'studioflow.app').toLowerCase()
  const type: DomainType = domain.endsWith(`.${rootDomain}`) ? 'subdomain' : 'custom'

  const { data, error } = await supabase
    .from('studio_domains')
    .insert({
      studio_id: studioId,
      domain,
      type,
      dns_target: DEFAULT_DNS_TARGET,
    })
    .select('*')
    .maybeSingle()

  if (error) {
    // 23505 = unique_violation (domain already exists)
    if ((error as any).code === '23505') {
      throw new Error('Ese dominio ya está registrado por otro estudio')
    }
    throw error
  }

  if (actorUserId && data) {
    await logActivity({
      studioId,
      actorId: actorUserId,
      actorType: 'user',
      entityType: 'studio',
      entityId: studioId,
      action: 'domain.added',
      metadata: { domain },
    }).catch(() => {})
  }

  return mapRow(data)
}

export async function removeDomainForStudio(
  studioId: string,
  domainId: string,
  actorUserId?: string | null,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { data: row } = await supabase
    .from('studio_domains')
    .select('id, studio_id, domain, is_primary')
    .eq('id', domainId)
    .eq('studio_id', studioId)
    .maybeSingle()

  if (!row) throw new Error('Dominio no encontrado')
  if (row.is_primary) throw new Error('No puedes eliminar el dominio principal')

  const { error } = await supabase
    .from('studio_domains')
    .delete()
    .eq('id', domainId)
    .eq('studio_id', studioId)
  if (error) throw error

  if (actorUserId) {
    await logActivity({
      studioId,
      actorId: actorUserId,
      actorType: 'user',
      entityType: 'studio',
      entityId: studioId,
      action: 'domain.removed',
      metadata: { domain: row.domain },
    }).catch(() => {})
  }
}

/**
 * Marca un dominio como primary. Desmarca el resto de forma atómica a nivel de
 * índice parcial único.
 */
export async function setPrimaryDomainForStudio(
  studioId: string,
  domainId: string,
  actorUserId?: string | null,
): Promise<void> {
  const supabase = createSupabaseServerClient()

  // Regla de memoria: limpiar ANTES de setear cuando hay índice único parcial
  const { error: clearErr } = await supabase
    .from('studio_domains')
    .update({ is_primary: false })
    .eq('studio_id', studioId)
  if (clearErr) throw clearErr

  const { error } = await supabase
    .from('studio_domains')
    .update({ is_primary: true })
    .eq('id', domainId)
    .eq('studio_id', studioId)
    .eq('status', 'active')

  if (error) throw error

  if (actorUserId) {
    await logActivity({
      studioId,
      actorId: actorUserId,
      actorType: 'user',
      entityType: 'studio',
      entityId: studioId,
      action: 'domain.primary_set',
      metadata: { domainId },
    }).catch(() => {})
  }
}

/**
 * Verifica el dominio via TXT record DNS. Usa el resolver del sistema operativo.
 * Devuelve el row actualizado.
 */
export async function verifyDomain(
  studioId: string,
  domainId: string,
  actorUserId?: string | null,
): Promise<StudioDomain> {
  const supabase = createSupabaseServerClient()

  const { data: row, error: fetchErr } = await supabase
    .from('studio_domains')
    .select('*')
    .eq('id', domainId)
    .eq('studio_id', studioId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!row) throw new Error('Dominio no encontrado')

  const target = mapRow(row)
  const { txtHost, txtValue } = getDnsInstructions(target)

  // Marca como verifying mientras corremos la query DNS
  await supabase
    .from('studio_domains')
    .update({ status: 'verifying', last_check_at: new Date().toISOString() })
    .eq('id', domainId)

  let matched = false
  let errorMsg: string | null = null

  try {
    const records = await dns.resolveTxt(txtHost)
    // records es string[][], aplanamos
    const flat = records.map((r) => r.join(''))
    matched = flat.includes(txtValue)
    if (!matched) {
      errorMsg = `Registro TXT no coincide. Se esperaba: ${txtValue}. Encontrado: ${flat.join(', ') || 'ninguno'}`
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      errorMsg = `No se encontró registro TXT en ${txtHost}`
    } else {
      errorMsg = `Error DNS: ${code ?? 'desconocido'}`
    }
  }

  const newStatus: DomainStatus = matched ? 'active' : 'failed'
  const patch = {
    status: newStatus,
    verified_at: matched ? new Date().toISOString() : null,
    last_check_at: new Date().toISOString(),
    last_error: errorMsg,
    ssl_status: matched ? 'issuing' : null,
  }

  const { data: updated, error: updateErr } = await supabase
    .from('studio_domains')
    .update(patch)
    .eq('id', domainId)
    .select('*')
    .maybeSingle()

  if (updateErr) throw updateErr

  if (actorUserId) {
    await logActivity({
      studioId,
      actorId: actorUserId,
      actorType: 'user',
      entityType: 'studio',
      entityId: studioId,
      action: matched ? 'domain.verified' : 'domain.verify_failed',
      metadata: { domain: target.domain, error: errorMsg },
    }).catch(() => {})
  }

  return mapRow(updated)
}

/**
 * Resolver de host → studio para routing dinámico.
 * Usa service client porque el request puede venir sin sesión (landing pública
 * del studio). Solo busca dominios activos.
 */
export async function getStudioByHost(
  host: string,
): Promise<{ studioId: string; studioSlug: string; domain: string } | null> {
  const clean = normalizeDomain(host)
  if (!clean) return null

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('studio_domains')
    .select('studio_id, domain, studios(slug)')
    .eq('domain', clean)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null

  return {
    studioId: data.studio_id,
    studioSlug: (data as any).studios?.slug ?? '',
    domain: data.domain,
  }
}
