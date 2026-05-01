import 'server-only'

import { cache } from 'react'

import { createSupabaseServerClient } from './server'
import { createSupabaseServiceClient } from './service'

export type StudioRole = 'owner' | 'admin' | 'staff' | 'finance' | 'viewer'

export interface AuthContext {
  userId: string
  email: string | null
  studioId: string | null
  studioRole: StudioRole | null
  isPlatformAdmin: boolean
}

/**
 * Resuelve el contexto del usuario actual: id, studio activo, rol.
 * Cacheado por request (via React `cache`) para evitar queries repetidas.
 *
 * Devuelve null si no hay sesión. No lanza — decide el caller.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // studio_members puede tener más de una fila si el usuario pertenece a
  // múltiples studios (staff en varios). Por ahora tomamos el primero
  // activo; cuando agreguemos UI de "switcher de studio" usaremos una
  // cookie dedicada para fijar el studio activo.
  const { data: member } = await supabase
    .from('studio_members')
    .select('studio_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  // is_platform_admin: consultamos directo por si el usuario es super admin
  // global. Esta query se hace con service role porque la tabla tiene RLS
  // restrictivo y el usuario aún no tiene JWT claim para sí mismo.
  let isPlatformAdmin = false
  try {
    const service = createSupabaseServiceClient()
    const { data: pa } = await service
      .from('platform_admins')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('revoked_at', null)
      .maybeSingle()
    isPlatformAdmin = !!pa
  } catch {
    // si no hay service role configurado, ignorar (no es super admin)
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    studioId: member?.studio_id ?? null,
    studioRole: (member?.role as StudioRole | undefined) ?? null,
    isPlatformAdmin,
  }
})

/**
 * Exige un usuario autenticado con studio activo. Lanza si falta algo.
 * Para uso en Server Actions / Route Handlers del panel interno.
 */
export async function requireStudioAuth(): Promise<
  AuthContext & { studioId: string; studioRole: StudioRole }
> {
  const ctx = await getAuthContext()
  if (!ctx) {
    throw new Error('UNAUTHENTICATED')
  }
  if (!ctx.studioId || !ctx.studioRole) {
    throw new Error('NO_ACTIVE_STUDIO')
  }
  return ctx as AuthContext & { studioId: string; studioRole: StudioRole }
}

export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error('UNAUTHENTICATED')
  if (!ctx.isPlatformAdmin) throw new Error('NOT_PLATFORM_ADMIN')
  return ctx
}

export function roleCanManage(role: StudioRole | null): boolean {
  return role === 'owner' || role === 'admin'
}

export function roleCanWriteCrm(role: StudioRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'staff'
}
