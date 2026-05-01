/**
 * DEPRECATED — NextAuth fue reemplazado por Supabase Auth el 2026-04-18.
 *
 * Este archivo mantiene una API mínima de compatibilidad para que el código
 * existente que importa `auth()` no se rompa de golpe. La implementación
 * delega al nuevo `getAuthContext()` de `@/server/supabase/auth-context`.
 *
 * Migrar progresivamente:
 *   - `import { auth } from '@/lib/auth'`  →
 *     `import { getAuthContext } from '@/server/supabase/auth-context'`
 *   - `signIn` / `signOut` / `handlers` → server actions en `app/(auth)/actions.ts`
 *     o endpoints en `/auth/callback` y `/auth/signout`.
 *
 * Cuando todos los imports estén migrados, borra este archivo.
 */

import 'server-only'

import { getAuthContext } from '@/server/supabase/auth-context'

/**
 * Devuelve el contexto de auth con la forma mínima que usaba el código
 * viejo de NextAuth: `session.user.{id,studioId,studioSlug,role,...}`.
 * Null si no hay sesión.
 */
export async function auth(): Promise<{
  user: {
    id: string
    email: string | null
    studioId: string | null
    studioSlug: string | null
    studioName: string | null
    role: string | null
    isPlatformAdmin: boolean
  }
} | null> {
  const ctx = await getAuthContext()
  if (!ctx) return null
  return {
    user: {
      id: ctx.userId,
      email: ctx.email,
      studioId: ctx.studioId,
      studioSlug: null, // derivar si un caller lo necesita
      studioName: null,
      role: ctx.studioRole,
      isPlatformAdmin: ctx.isPlatformAdmin,
    },
  }
}

// No exportamos signIn / signOut / handlers — si alguien los importa, que
// rompa en TypeScript y los obligue a migrar.
