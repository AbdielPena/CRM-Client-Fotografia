import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/supabase'

import { SUPABASE_URL, requireServiceRole } from './env'

let cached: SupabaseClient<Database> | null = null

/**
 * Cliente Supabase con service role key. OMITE todas las RLS policies.
 * Uso estricto:
 *   - Workers / cron jobs
 *   - Edge Functions que necesitan escribir cross-tenant (ej: worker de emails)
 *   - Server Actions que explícitamente elevan privilegios (ej: crear studios
 *     en el flujo de registro)
 *   - Firma de contratos / inserción de `contract_signatures` con audit completo
 *
 * Nunca importes este módulo desde código que pueda correr en el cliente.
 */
export function createSupabaseServiceClient(): SupabaseClient<Database> {
  if (cached) return cached
  cached = createClient<Database>(SUPABASE_URL, requireServiceRole(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-client-info': 'studioflow-service',
      },
    },
  })
  return cached
}
