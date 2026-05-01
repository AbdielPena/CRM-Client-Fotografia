import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/supabase'
import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'

export type Db = SupabaseClient<Database>

export interface RepoOptions {
  /**
   * Si true, usa el cliente con service role (omite RLS). Solo para
   * operaciones privilegiadas (workers, registros, super admin).
   * Default: false → usa cliente SSR con JWT del usuario.
   */
  elevated?: boolean
}

export function getDb(opts: RepoOptions = {}): Db {
  return opts.elevated ? createSupabaseServiceClient() : createSupabaseServerClient()
}

/**
 * Wrapper estándar para queries: lanza error con contexto si Supabase devuelve
 * error, en lugar de obligar a revisar { data, error } en cada llamada.
 */
export async function run<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
  context: string,
): Promise<T> {
  const { data, error } = await promise
  if (error) {
    throw new RepoError(`[${context}] ${error.message}`, {
      code: error.code,
      context,
    })
  }
  if (data === null || data === undefined) {
    throw new RepoError(`[${context}] resultado vacío`, { context })
  }
  return data
}

/**
 * Variante que permite que el resultado sea null (p.ej. findById no encontrado).
 */
export async function runMaybe<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
  context: string,
): Promise<T | null> {
  const { data, error } = await promise
  if (error) {
    // PGRST116 = row not found cuando usas .single(); tratamos como null
    if (error.code === 'PGRST116') return null
    throw new RepoError(`[${context}] ${error.message}`, {
      code: error.code,
      context,
    })
  }
  return data ?? null
}

export class RepoError extends Error {
  code?: string
  context?: string
  constructor(message: string, meta?: { code?: string; context?: string }) {
    super(message)
    this.name = 'RepoError'
    this.code = meta?.code
    this.context = meta?.context
  }
}
