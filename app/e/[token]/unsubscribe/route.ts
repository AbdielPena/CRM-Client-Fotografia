import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Baja de correos NO esenciales (marketing / engagement) — destino de la
 * cabecera `List-Unsubscribe` de 1 clic (RFC 8058).
 *
 *  - POST  → one-click (lo hace el proveedor de correo, ej. Gmail): marca la
 *            baja y devuelve 200. Seguro contra prefetch (no muta en GET).
 *  - GET   → página humana con un botón que hace POST. NO muta en GET (los
 *            escáneres/prefetch de enlaces hacen GET y borrarían la suscripción
 *            sin querer).
 *
 * Los correos transaccionales (facturas, contratos, galería, entrega,
 * impresiones, recordatorios de pago) siguen llegando: la baja solo afecta el
 * marketing.
 */

export const dynamic = "force-dynamic"

function html(body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"/>` +
      `<meta name="viewport" content="width=device-width, initial-scale=1"/>` +
      `<title>Preferencias de correo</title>` +
      `<style>body{margin:0;background:#F0F1F4;font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:#1C1C1C;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}` +
      `.card{max-width:460px;width:100%;background:#fff;border:1px solid #ECECEF;border-radius:20px;padding:36px 32px;text-align:center}` +
      `h1{font-size:20px;margin:0 0 10px;letter-spacing:-.01em}p{color:#6E6E73;font-size:14.5px;line-height:1.6;margin:0 0 18px}` +
      `.btn{display:inline-block;border:0;cursor:pointer;background:#1C1C1C;color:#fff;font-weight:600;font-size:14px;padding:12px 22px;border-radius:12px;text-decoration:none}` +
      `.muted{font-size:12.5px;color:#A1A1A6;margin-top:18px}</style></head><body><div class="card">${body}</div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

async function markOptedOut(token: string): Promise<boolean> {
  const sb = untypedService()
  const { error } = await sb
    .from("clients")
    .update({ email_opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("email_token", token)
    .is("email_opted_out_at", null)
  // Si ya estaba de baja, el update no afecta filas pero igual es "ok".
  return !error
}

const DONE_HTML =
  `<h1>Listo ✓</h1><p>Te diste de baja de nuestros correos promocionales y recordatorios no esenciales.</p>` +
  `<p class="muted">Seguirás recibiendo lo esencial de tus sesiones (facturas, contratos, tu galería y entregas).</p>`

export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } },
): Promise<NextResponse> {
  await markOptedOut(params.token)
  // One-click: el cliente de correo espera un 2xx simple.
  return html(DONE_HTML)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
): Promise<NextResponse> {
  // NO muta en GET (prefetch-safe). Muestra un botón que hace POST.
  return html(
    `<h1>¿Darte de baja?</h1>` +
      `<p>Dejarás de recibir <strong>correos promocionales y recordatorios no esenciales</strong>. ` +
      `Los correos importantes de tus sesiones (facturas, contratos, galería y entregas) seguirán llegando.</p>` +
      `<form method="post" action="/e/${encodeURIComponent(params.token)}/unsubscribe">` +
      `<button class="btn" type="submit">Sí, darme de baja</button></form>` +
      `<p class="muted">¿Fue sin querer? Cierra esta página y no cambia nada.</p>`,
  )
}
