// Supabase Edge Function — Mail IMAP sync cron
//
// Dispara cada 5 minutos vía pg_cron + supabase.functions.invoke('mail-sync-cron').
// Llama al endpoint /api/mail/sync de studioflow autenticado con
// MAIL_SYNC_TOKEN. Esto separa:
//   - Edge Function (orquesta + auth, no hace IMAP — Deno no soporta net.Socket
//     para IMAP raw, e imapflow no compila en edge runtime fácilmente)
//   - Next.js app (hace IMAP + persistence)
//
// Configuración:
//   1. Deploy:
//      supabase functions deploy mail-sync-cron
//   2. Secret:
//      supabase secrets set MAIL_SYNC_URL=https://my.abbypixel.com/api/mail/sync
//      supabase secrets set MAIL_SYNC_TOKEN=<el-mismo-de-la-app>
//   3. Cron (en SQL editor o migration):
//      SELECT cron.schedule(
//        'mail-imap-sync-every-5min',
//        '*/5 * * * *',
//        $$
//          SELECT net.http_post(
//            url := (SELECT vault.read_secret('supabase_url')) || '/functions/v1/mail-sync-cron',
//            headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT vault.read_secret('supabase_anon_key')))
//          );
//        $$
//      );
//
// Deno globals via Edge runtime — no type imports needed.
// @ts-nocheck

const SYNC_URL = Deno.env.get("MAIL_SYNC_URL")
const SYNC_TOKEN = Deno.env.get("MAIL_SYNC_TOKEN")

Deno.serve(async (_req: Request) => {
  if (!SYNC_URL || !SYNC_TOKEN) {
    return new Response(
      JSON.stringify({ error: "MAIL_SYNC_URL or MAIL_SYNC_TOKEN not configured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    )
  }

  const startedAt = Date.now()
  try {
    const res = await fetch(SYNC_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${SYNC_TOKEN}`,
      },
      signal: AbortSignal.timeout(50_000), // 50s — bajo el cap de 60s del runtime
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error("[mail-sync-cron] HTTP", res.status, text.slice(0, 500))
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Sync endpoint returned ${res.status}`,
          body: text.slice(0, 500),
        }),
        { status: 502, headers: { "content-type": "application/json" } },
      )
    }

    const body = await res.json().catch(() => ({}))
    const durationMs = Date.now() - startedAt
    console.log(
      `[mail-sync-cron] OK ${durationMs}ms — ${JSON.stringify(body.summary ?? {})}`,
    )
    return new Response(JSON.stringify({ ok: true, durationMs, ...body }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown"
    console.error("[mail-sync-cron] crash:", msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }
})
