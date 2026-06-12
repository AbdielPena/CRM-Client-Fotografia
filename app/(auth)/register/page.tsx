import { redirect } from "next/navigation"

/**
 * Registro centralizado en el hub (PixelOS).
 *
 * El alta de cuentas/estudios se hace SOLO desde el hub. Quien llegue a /register
 * en el CRM se redirige al hub, que abre directo en "Crear cuenta". Tras crear la
 * cuenta, al entrar al CRM `requireStudioAuth` lo lleva a /setup y se hace el
 * bootstrap del estudio (mismo Supabase → mismas credenciales).
 */
// Dinámica: si fuera estática, Next evalúa el redirect en build y cachea un 200
// en vez de redirigir en cada request.
export const dynamic = "force-dynamic"

const HUB_SIGNUP_URL = "https://hub.abbypixel.com/login?mode=signup"

export default function RegisterPage() {
  redirect(HUB_SIGNUP_URL)
}
