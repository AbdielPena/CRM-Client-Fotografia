import 'server-only'

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import type { Database } from '@/types/supabase'

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

/**
 * Cookie domain compartido entre subdominios.
 *
 * Cuando AUTH_COOKIE_DOMAIN está seteado (e.g. ".abbypixel.com"), el cookie
 * de sesión de Supabase se comparte entre hub.abbypixel.com, my.abbypixel.com,
 * fi.abbypixel.com, inventario.abbypixel.com, etc. Esto permite SSO cross-
 * subdomain: un login en cualquier módulo (o en el hub) logea al usuario
 * en TODOS los demás sin re-loguear.
 *
 * En dev (localhost) se deja vacío para que el cookie sea host-only.
 */
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN
function applyDomain(options: CookieOptions): CookieOptions {
  if (AUTH_COOKIE_DOMAIN && !options.domain) {
    return { ...options, domain: AUTH_COOKIE_DOMAIN }
  }
  return options
}

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
          cookieStore.set({ name, value, ...applyDomain(options) })
        } catch {
          // Server Components no pueden escribir cookies; se ignora.
          // Las Actions/Route Handlers sí pueden.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...applyDomain(options) })
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
