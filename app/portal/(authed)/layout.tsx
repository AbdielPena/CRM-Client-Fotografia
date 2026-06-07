import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { PortalLogoutButton } from "@/components/portal/portal-logout-button"
import { PortalNav } from "@/components/portal/portal-nav"

export const dynamic = "force-dynamic"

export default async function PortalAuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const raw = cookies().get(PORTAL_COOKIE_NAME)?.value
  const session = parsePortalCookieValue(raw)
  if (!session) {
    redirect("/portal/login")
  }

  const supabase = createSupabaseServiceClient()
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, studio_id, studios(name, logo_url)")
    .eq("id", session.clientId)
    .maybeSingle()
  if (!client) redirect("/portal/login")

  const c = client as {
    id: string
    name: string
    email: string | null
    studio_id: string
    studios: { name: string; logo_url: string | null } | null
  }

  const studioName = c.studios?.name ?? "Tu portal"

  return (
    <div className="client-luxe min-h-screen bg-background">
      <header className="sticky top-0 z-30 lx-glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3.5 pb-3 sm:px-6">
          <div className="flex items-center gap-3">
            {c.studios?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.studios.logo_url}
                alt={studioName}
                className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 font-serif text-base font-semibold text-white">
                {studioName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-serif text-[15px] font-semibold text-foreground">
                {studioName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Hola, {c.name.split(" ")[0]}
              </p>
            </div>
          </div>
          <PortalLogoutButton />
        </div>

        <PortalNav />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-[11px] tracking-wide text-muted-foreground/70">
        Portal privado de {studioName} · Solo tú puedes ver esta información.
      </footer>
    </div>
  )
}
