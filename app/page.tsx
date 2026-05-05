import { redirect } from "next/navigation"
import { getAuthContext } from "@/server/supabase/auth-context"

export default async function RootPage() {
  const ctx = await getAuthContext()

  if (ctx?.studioId) {
    redirect("/dashboard")
  }

  redirect("/login")
}
