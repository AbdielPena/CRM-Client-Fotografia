import { redirect } from "next/navigation"
import { getAuthContext } from "@/server/supabase/auth-context"

export default async function RootPage() {
  const ctx = await getAuthContext()

  // No autenticado → login
  if (!ctx) {
    redirect("/login")
  }

  // Autenticado con studio activo → dashboard
  if (ctx.studioId) {
    redirect("/dashboard")
  }

  // Autenticado SIN studio (recién registrado en el hub / llegó vía SSO sin
  // membership todavía) → onboarding para crear su studio. Antes esto caía
  // erróneamente en /login, dejando al usuario en un loop sin poder entrar.
  redirect("/setup")
}
