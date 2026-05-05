import { redirect } from 'next/navigation'
import { cache } from 'react'

import { createSupabaseServerClient } from '@/server/supabase/server'
import {
  getAuthContext,
  type StudioRole,
} from '@/server/supabase/auth-context'

export type { StudioRole } from '@/server/supabase/auth-context'

export type StudioSession = {
  userId: string
  studioId: string
  studioSlug: string
  studioName: string
  role: StudioRole
  email: string
  name: string
}

/**
 * Compatibilidad con el código viejo de NextAuth.
 *
 * Requiere sesión + studio activo. Si no hay sesión → /login.
 * Si hay sesión pero no studio → /setup (onboarding).
 * Enriquece con studioSlug / studioName desde la tabla `studios`.
 *
 * NOTA: versiones nuevas deberían usar directamente
 * `requireStudioAuth` de `@/server/supabase/auth-context`.
 *
 * Cacheado por request con React `cache()` — invocaciones múltiples
 * dentro del mismo render solo ejecutan UNA query a `studios`.
 */
export const requireStudioAuth = cache(
  async (): Promise<StudioSession> => {
    const ctx = await getAuthContext()

    if (!ctx) {
      redirect('/login')
    }
    if (!ctx.studioId || !ctx.studioRole) {
      redirect('/setup')
    }

    const supabase = createSupabaseServerClient()
    const { data: studio } = await supabase
      .from('studios')
      .select('slug, name')
      .eq('id', ctx.studioId)
      .maybeSingle()

    return {
      userId: ctx.userId,
      studioId: ctx.studioId,
      studioSlug: studio?.slug ?? '',
      studioName: studio?.name ?? 'Mi Estudio',
      role: ctx.studioRole,
      email: ctx.email ?? '',
      name: ctx.userName ?? '',
    }
  },
)

const ROLE_RANK: Record<StudioRole, number> = {
  viewer: 0,
  finance: 1,
  staff: 2,
  admin: 3,
  owner: 4,
}

/**
 * Exige que el user tenga al menos un rol mínimo. Retorna la sesión
 * enriquecida igual que requireStudioAuth.
 */
export async function requireRole(
  minRole: StudioRole,
): Promise<StudioSession> {
  const session = await requireStudioAuth()
  if (ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
    redirect('/dashboard')
  }
  return session
}
