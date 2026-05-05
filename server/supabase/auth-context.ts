import 'server-only'

import { cache } from 'react'

import { createSupabaseServerClient } from './server'
import { createSupabaseServiceClient } from './service'

export type StudioRole = 'owner' | 'admin' | 'staff' | 'finance' | 'viewer'

export interface AuthContext {
  userId: string
  email: string | null
  userName: string | null
  studioId: string | null
  studioRole: StudioRole | null
  isPlatformAdmin: boolean
}

/**
 * Resuelve el contexto del usuario actual: id, studio activo, rol.
 * Cacheado por request (via React `cache`) para evitar queries repetidas.
 *
 * Optimización: las queries a studio_members y platform_admins corren
 * en paralelo (Promise.all) en lugar de secuencial — ahorra ~80ms.
 *
 * Devuelve null si no hay sesión. No lanza — decide el caller.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Paralelizar las 2 queries de auth metadata (~80ms ahorro vs secuencial)
  const service = createSupabaseServiceClient()
  const platformAdminPromise = (async () => {
    try {
      const r = await service
        .from('platform_admins')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .is('revoked_at', null)
        .maybeSingle()
      return r.data
    } catch {
      return null
    }
  })()

  const [memberRes, platformAdminRow] = await Promise.all([
    supabase
      .from('studio_members')
      .select('studio_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle(),
    platformAdminPromise,
  ])

  const member = memberRes.data
  const isPlatformAdmin = !!platformAdminRow

  const userName =
    (user.user_metadata?.['full_name'] as string | undefined) ??
    (user.user_metadata?.['name'] as string | undefined) ??
    null

  return {
    userId: user.id,
    email: user.email ?? null,
    userName,
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
