// ─── DEPRECATED ────────────────────────────────────────────────────────────────
// El seed de Prisma ya no aplica: la DB ahora es Supabase y los datos iniciales
// se crean vía SQL migrations (01–08) aplicadas con el MCP de Supabase.
//
// Para crear un estudio demo, ejecutar el SQL correspondiente en Supabase.

export {}

if (require.main === module) {
  console.error(
    "prisma/seed.ts está deprecado. Ver migraciones SQL en Supabase project kbrcqyjnrbjlzfolpcsx.",
  )
  process.exit(1)
}
