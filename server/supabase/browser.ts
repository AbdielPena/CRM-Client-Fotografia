'use client'

import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '@/types/supabase'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cookie domain compartido entre subdominios — debe matchear lo que setea
// el server (AUTH_COOKIE_DOMAIN). Si no está seteado, cookies son host-only.
const cookieDomain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN

/**
 * Cliente Supabase para uso en el browser (componentes client-side).
 * Lee/escribe cookies, maneja el refresh de sesión.
 *
 * Con NEXT_PUBLIC_AUTH_COOKIE_DOMAIN seteado a ".abbypixel.com", el cookie de
 * sesión es accesible desde TODOS los subdominios (hub, my, fi, inventario)
 * — permite SSO cross-subdomain sin re-loguear.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient
  browserClient = createBrowserClient<Database>(url, anon, {
    cookieOptions: cookieDomain ? { domain: cookieDomain } : undefined,
  })
  return browserClient
}
