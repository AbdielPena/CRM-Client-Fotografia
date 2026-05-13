import "server-only"

import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js"
import { z } from "zod"

import { env } from "@/lib/env"

/**
 * GET /api/auth/hub-sso?token=<JWT>&redirect=<path>
 *
 * Endpoint inbound del Studio Business Hub.
 *
 * 1. Valida JWT (HS256, secret compartido HUB_JWT_SECRET, aud="studioflow", TTL 5min).
 * 2. Asegura que el usuario existe en Supabase Auth (admin upsert por email).
 * 3. Genera un magic link administrativo y redirige el browser a `action_link`,
 *    el cual Supabase intercepta, setea la cookie de sesión y vuelve al `redirect`.
 *
 * No requiere sesión previa — el JWT del hub ES la prueba de identidad.
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

  // 3. Generar magic link y redirigir al action_link
  // El callback de Supabase (configurado por Supabase como ${SUPABASE_URL}/auth/v1/verify)
  // intercambia el token y redirige a `redirectTo`.
  const safeRedirect = sanitizeRedirect(redirectParam)
  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  const finalRedirect = new URL(safeRedirect, baseAppUrl).toString()

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: claims.email,
    options: { redirectTo: finalRedirect },
  })
  if (linkErr || !linkData?.properties?.action_link) {
    console.error("[hub-sso] generateLink falló", linkErr)
    return serverError("No se pudo generar enlace de sesión")
  }

  return NextResponse.redirect(linkData.properties.action_link)
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
