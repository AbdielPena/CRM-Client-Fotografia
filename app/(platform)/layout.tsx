import { redirect } from "next/navigation"

import { PlatformSidebar } from "@/components/platform/platform-sidebar"
import { getAuthContext } from "@/server/supabase/auth-context"
import { createSupabaseServerClient } from "@/server/supabase/server"

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getAuthContext()

  if (!ctx) redirect("/login?next=/platform")
  if (!ctx.isPlatformAdmin) redirect("/dashboard?error=forbidden_platform")

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email ??
    "Admin"

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <PlatformSidebar userName={userName} userEmail={ctx.email ?? ""} />

      {/* Ambient Aurora glow behind platform content (more subtle tint) */}
      <main className="relative flex-1 overflow-y-auto">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] opacity-[0.3] dark:opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 80% at 20% 0%, hsl(var(--brand) / 0.20), transparent 55%), radial-gradient(ellipse 50% 70% at 85% 10%, hsl(292 84% 60% / 0.14), transparent 60%)",
          }}
        />
        {children}
      </main>
    </div>
  )
}
