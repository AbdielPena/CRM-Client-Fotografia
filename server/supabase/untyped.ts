import "server-only"

import { createSupabaseServerClient } from "./server"
import { createSupabaseServiceClient } from "./service"

/**
 * Helpers para acceder a tablas cuyo schema todavía no está generado en
 * `types/supabase.ts` (porque la migration no está aplicada/regen en local).
 *
 * Los clientes "untyped" son cast a `any` — bypasean el chequeo de column
 * names. RLS y service role siguen aplicando normalmente.
 *
 * Cuando una migration nueva se aplique y se ejecute:
 *   npx supabase gen types typescript --linked > types/supabase.ts
 * los services pueden migrar progresivamente de `untypedServer/Service` a
 * `createSupabaseServerClient/ServiceClient` con tipos.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function untypedServer(): any {
  return createSupabaseServerClient()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function untypedService(): any {
  return createSupabaseServiceClient()
}
