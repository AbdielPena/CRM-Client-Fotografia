import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import type { Database } from '@/types/supabase'

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

/**
 * Crea un cliente Supabase para middleware.ts que PUEDE refrescar la sesión.
 * Devuelve { supabase, response } — importante usar el response que retorna
 * para que las cookies actualizadas se propaguen al browser.
 */
export function createSupabaseMiddlewareClient(req: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        req.cookies.set({ name, value, ...options })
        response = NextResponse.next({ request: { headers: req.headers } })
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        req.cookies.set({ name, value: '', ...options })
        response = NextResponse.next({ request: { headers: req.headers } })
        response.cookies.set({ name, value: '', ...options })
      },
    },
  })

  return { supabase, response }
}
