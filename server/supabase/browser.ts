'use client'

import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '@/types/supabase'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Cliente Supabase para uso en el browser (componentes client-side).
 * Lee/escribe cookies, maneja el refresh de sesión.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient
  browserClient = createBrowserClient<Database>(url, anon)
  return browserClient
}
