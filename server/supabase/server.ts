import 'server-only'

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import type { Database } from '@/types/supabase'

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

/**
 * Cliente Supabase SSR para uso en:
 *  - Server Components
 *  - Server Actions
 *  - Route Handlers
 *
 * Respeta la sesión del usuario desde cookies. RLS se enforza con el JWT
 * del usuario autenticado. No usa service role.
 */
export function createSupabaseServerClient(): SupabaseClient<Database> {
  const cookieStore = cookies()

  // NOTA: cast a SupabaseClient<Database> necesario porque @supabase/ssr@0.5.1
  // usa un orden de generics antiguo que ya no cuadra con supabase-js@2.103+,
  // lo cual colapsa la inferencia de tablas/filtros/rpc a `never`. El cast
  // alinea el tipo con la versión actual de supabase-js.
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options })
        } catch {
          // Server Components no pueden escribir cookies; se ignora.
          // Las Actions/Route Handlers sí pueden.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options })
        } catch {
          // igual que arriba
        }
      },
    },
  }) as unknown as SupabaseClient<Database>
}

/**
 * Variante para páginas públicas (/p/[slug], /c/[token], /f/[token]).
 * No lee cookies — usa anon key y, opcionalmente, inyecta un header
 * `x-public-token` para disparar las RLS policies de acceso público.
 */
export function createSupabasePublicClient(publicToken?: string): SupabaseClient<Database> {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get: () => undefined,
      set: () => undefined,
      remove: () => undefined,
    },
    global: publicToken
      ? {
          headers: {
            'x-public-token': publicToken,
          },
        }
      : undefined,
  }) as unknown as SupabaseClient<Database>
}
