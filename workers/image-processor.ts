/**
 * Image Processing Worker — DESHABILITADO
 *
 * El módulo de galerías está deshabilitado mientras se rehace sobre Supabase
 * Storage. Cuando vuelva, el procesamiento correrá como Supabase Edge Function
 * con triggers sobre inserts en `gallery_assets`.
 */

export {}

if (require.main === module) {
  console.error(
    "workers/image-processor.ts está deprecado. Galerías deshabilitadas temporalmente.",
  )
  process.exit(1)
}
