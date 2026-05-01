/**
 * Email Sending Worker — DESHABILITADO
 *
 * La cola BullMQ/Redis fue reemplazada por Supabase Edge Functions.
 * Ver `supabase/functions/send-email/` para el nuevo worker serverless.
 */

export {}

if (require.main === module) {
  console.error(
    "workers/email-sender.ts está deprecado. Usar Supabase Edge Function `send-email` en su lugar.",
  )
  process.exit(1)
}
