import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/server/supabase/env"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { createApiToken } from "@/server/services/api-token.service"

// Login del programa de escritorio: verifica email+password contra Supabase Auth
// y acuña un api_token (token de dispositivo) ligado al studio del usuario.
// El token se devuelve en texto UNA sola vez. Revocable desde Ajustes → Dispositivos.
export const dynamic = "force-dynamic"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().max(80).optional(),
})

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  // Cliente stateless solo para verificar credenciales (no setea cookies).
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: signIn, error: signErr } = await authClient.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  })
  if (signErr || !signIn.user) {
    return NextResponse.json({ error: "Correo o contraseña inválidos" }, { status: 401 })
  }
  const userId = signIn.user.id

  const service = createSupabaseServiceClient()
  const { data: member } = await service
    .from("studio_members")
    .select("studio_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()
  if (!member?.studio_id) {
    return NextResponse.json({ error: "El usuario no tiene un estudio activo" }, { status: 403 })
  }

  const { data: studio } = await service
    .from("studios")
    .select("name")
    .eq("id", member.studio_id)
    .maybeSingle()

  const { token, plaintext } = await createApiToken(member.studio_id, userId, {
    name: body.deviceName?.trim() || "StudioFlow Desktop",
    scopes: ["read", "write"],
  })

  return NextResponse.json({
    token: plaintext,
    tokenId: token.id,
    studioId: member.studio_id,
    studioName: (studio as { name: string } | null)?.name ?? null,
    role: member.role,
    user: { id: userId, email: signIn.user.email ?? null },
  })
}
