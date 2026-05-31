import "server-only"

import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js"
import { z } from "zod"

import { env } from "@/lib/env"
import { createSupabaseServerClient } from "@/server/supabase/server"

/**
 * GET /api/auth/hub-sso?token=<JWT>&redirect=<path>
 *
 * Endpoint inbound del Studio Business Hub.
 *
 * 1. Valida JWT (HS256, secret compartido HUB_JWT_SECRET, aud="studioflow", TTL 5min).
 * 2. Asegura que el usuario existe en Supabase Auth (admin upsert por email).
 * 3. Genera un magic link administrativo, extrae el `hashed_token`, y lo
 *    verifica SERVER-SIDE con verifyOtp() usando el server client de @supabase/ssr.
 *    Esto setea las cookies de sesión (con domain .abbypixel.com) directamente,
 *    sin depender de que el browser procese un hash #access_token (el CRM no
 *    tiene ese handler). Luego redirige al `redirect` ya autenticado.
 *
 * No requiere sesión previa — el JWT del hub ES la prueba de identidad.
 *
 * Arquitectura federada (2026-05-25): hub.abbypixel.com es el launcher master,
 * cada módulo (CRM=my, Finanzas=fi, Inventario=inventario) vive en su subdominio
 * y comparte DB Supabase + cookie de auth cross-subdomain (.abbypixel.com).
 */

const ClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  redirect: z.string().optional(),
  aud: z.string().optional(),
  iss: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  const redirectParam = request.nextUrl.searchParams.get("redirect") || "/"

  if (!token) {
    return badRequest("Falta token")
  }

  // 1. Verificar JWT
  const jwtSecret = process.env.HUB_JWT_SECRET
  if (!jwtSecret) {
    console.error("[hub-sso] HUB_JWT_SECRET no configurado")
    return serverError("hub-sso no configurado en este servidor")
  }

  let claims: z.infer<typeof ClaimsSchema>
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
      issuer: process.env.HUB_JWT_ISSUER ?? "studio-hub",
      audience: "studioflow",
    })
    const parsed = ClaimsSchema.safeParse(payload)
    if (!parsed.success) {
      console.error("[hub-sso] payload inválido", parsed.error.flatten())
      return badRequest("Token con payload inválido")
    }
    claims = parsed.data
  } catch (err) {
    console.error("[hub-sso] jwtVerify falló", err)
    return unauthorized("Token inválido o expirado")
  }

  // 2. Asegurar usuario en Supabase Auth
  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Buscar por email (admin.listUsers no es óptimo pero es la API expuesta)
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  let user = list?.users.find((u) => u.email?.toLowerCase() === claims.email.toLowerCase())

  if (!user) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: claims.email,
      email_confirm: true,
      user_metadata: claims.name ? { full_name: claims.name, hub_sub: claims.sub } : { hub_sub: claims.sub },
    })
    if (createErr || !created.user) {
      console.error("[hub-sso] createUser falló", createErr)
      return serverError("No se pudo crear usuario")
    }
    user = created.user
  }

  // 3. Generar magic link → obtener hashed_token → verificar OTP server-side.
  //
  // Por qué verifyOtp server-side en vez de redirigir al action_link:
  // El action_link de Supabase devuelve los tokens en el HASH del URL
  // (#access_token=...&refresh_token=...). El hash solo lo ve el JS del browser,
  // y el CRM no tiene un handler que procese ese hash → la sesión nunca se
  // establecía y /dashboard redirigía a /login.
  //
  // verifyOtp() con el server client de @supabase/ssr canjea el token_hash y
  // ESCRIBE las cookies de sesión directamente (con domain .abbypixel.com vía
  // el applyDomain del server client). Así la redirección a /dashboard ya
  // llega autenticada — sin JS, sin hash, robusto.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: claims.email,
  })
  const hashedToken = linkData?.properties?.hashed_token
  if (linkErr || !hashedToken) {
    console.error("[hub-sso] generateLink falló", linkErr)
    return serverError("No se pudo generar enlace de sesión")
  }

  const safeRedirect = sanitizeRedirect(redirectParam)
  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  const finalRedirect = new URL(safeRedirect, baseAppUrl).toString()

  // La respuesta DEBE ser la que lleva las cookies. Creamos el redirect primero
  // y dejamos que el server client escriba las cookies sobre cookies() (que en
  // un Route Handler se propagan a la respuesta).
  const supabase = createSupabaseServerClient()
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "email",
  })
  if (verifyErr) {
    console.error("[hub-sso] verifyOtp falló", verifyErr)
    return serverError("No se pudo establecer la sesión")
  }

  return NextResponse.redirect(finalRedirect)
}

function sanitizeRedirect(path: string): string {
  // Evitar open-redirect: solo paths relativos.
  if (!path.startsWith("/")) return "/"
  if (path.startsWith("//")) return "/"
  return path
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}
function unauthorized(msg: string) {
  return NextResponse.json({ error: msg }, { status: 401 })
}
function serverError(msg: string) {
  return NextResponse.json({ error: msg }, { status: 500 })
}
