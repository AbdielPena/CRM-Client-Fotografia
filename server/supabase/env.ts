/**
 * Supabase env vars — centralizadas y validadas.
 * Se leen una sola vez al importar.
 */

const required = (name: string, value: string | undefined): string => {
  if (!value || value.length === 0) {
    throw new Error(
      `[supabase/env] falta la variable de entorno ${name}. ` +
        `Agrega ${name} a .env.local (o al entorno del deploy).`,
    )
  }
  return value
}

export const SUPABASE_URL = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)

export const SUPABASE_ANON_KEY = required(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

/**
 * service role: SOLO en contextos server (edge functions, server actions con
 * elevación explícita, workers). NUNCA expones esta key al cliente.
 */
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const hasServiceRole = () => SUPABASE_SERVICE_ROLE_KEY.length > 0

export const requireServiceRole = () => {
  if (!hasServiceRole()) {
    throw new Error(
      '[supabase/env] SUPABASE_SERVICE_ROLE_KEY no configurada. Requerida para esta operación.',
    )
  }
  return SUPABASE_SERVICE_ROLE_KEY
}
