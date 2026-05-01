import { redirect } from 'next/navigation'

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
 * Requiere sesión + studio activo. Si no, redirige a /login.
 * Enriquece con studioSlug / studioName desde la tabla `studios`.
 *
 * NOTA: versiones nuevas deberían usar directamente
 * `requireStudioAuth` de `@/server/supabase/auth-context`.
 */
export async function requireStudioAuth(): Promise<StudioSession> {
  const ctx = await getAuthContext()

  if (!ctx || !ctx.studioId || !ctx.studioRole) {
    redirect('/login')
  }

  const supabase = createSupabaseServerClient()
  const { data: studio } = await supabase
    .from('studios')
    .select('slug, name')
    .eq('id', ctx.studioId)
    .maybeSingle()

  // user metadata (nombre del usuario) viene del JWT de Supabase
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const rawName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    ''

  return {
    userId: ctx.userId,
    studioId: ctx.studioId,
    studioSlug: studio?.slug ?? '',
    studioName: studio?.name ?? 'Mi Estudio',
    role: ctx.studioRole,
    email: ctx.email ?? '',
    name: rawName,
  }
}

// Jerarquía de roles (Supabase usa lowercase). Más a la derecha = más permisos.
const ROLE_HIERARCHY: StudioRole[] = ['viewer', 'staff', 'finance', 'admin', 'owner']

export async function requireRole(
  minimumRole: StudioRole,
  session?: StudioSession,
): Promise<StudioSession> {
  const s = session ?? (await requireStudioAuth())

  const sessionIdx = ROLE_HIERARCHY.indexOf(s.role)
  const requiredIdx = ROLE_HIERARCHY.indexOf(minimumRole)

  if (sessionIdx < requiredIdx) {
    redirect('/dashboard?error=forbidden')
  }

  return s
}
