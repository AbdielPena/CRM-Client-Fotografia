// ─── DEPRECATED ────────────────────────────────────────────────────────────────
// Prisma fue reemplazado por Supabase. Usar `createSupabaseServerClient` de
// `@/server/supabase/server` en su lugar.
//
// Este archivo se deja como stub para que los imports viejos (en archivos
// todavía no migrados) lancen un error claro en runtime, en lugar de intentar
// conectarse a una DB Prisma que ya no existe.

const handler: ProxyHandler<object> = {
  get() {
    throw new Error(
      "@/lib/db está deprecado. Migrar a createSupabaseServerClient() en @/server/supabase/server.",
    )
  },
}

export const db = new Proxy({}, handler) as never
