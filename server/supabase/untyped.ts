import "server-only"

import { createSupabaseServerClient } from "./server"
import { createSupabaseServiceClient } from "./service"

/**
 * Cliente Supabase sin tipos para tablas que aún no están en
 * `types/supabase.ts` (porque sus migrations no se han aplicado / regenerado).
 *
 * USO:
 *   const sb = untypedServer()
 *   const { data } = await sb.from('inv_items').select('*').eq('studio_id', studioId)
 *
 * Cuando se aplique la migration y se corra `npx supabase gen types typescript`
 * para regenerar `types/supabase.ts`, las tablas inv_*, fin_*, fiscal_*, mail_*
 * estarán tipadas y los services pueden migrar al cliente normal.
 *
 * NO usar este helper para tablas que SÍ están en `Database['public']['Tables']`
 * (clients, projects, invoices, etc.) — esas tienen tipos correctos.
 */

// El tipo any aquí es deliberado: bypasea el sistema de tipos generados de
// Supabase JS para tablas que el schema TS aún no conoce.
//
// Tradeoff: perdemos autocomplete + chequeo de columns en runtime para inv_*
// hasta que se regeneren los tipos. Aceptable para módulos en construcción.
// El typecheck del resto del código sigue funcionando.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function untypedServer(): any {
  return createSupabaseServerClient()
}

export function untypedService(): any {
  return createSupabaseServiceClient()
}
