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
    <div className="client-luxe portal-flat min-h-screen bg-background">
      <header className="sticky top-0 z-30 lx-glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3.5">
            {c.studios?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.studios.logo_url}
                alt={studioName}
                className="h-7 w-auto max-w-[170px] object-contain"
              />
            ) : (
              <span
                className="brand-logo text-foreground/90"
                role="img"
                aria-label={studioName}
              />
            )}
            <span
              className="hidden h-7 w-px bg-border sm:block"
              aria-hidden="true"
            />
            <p className="hidden truncate text-[12px] text-muted-foreground sm:block">
              Hola,{" "}
              <span className="font-medium text-foreground/80">
                {c.name.split(" ")[0]}
              </span>
            </p>
          </div>
          <PortalLogoutButton />
        </div>

        {/* Nav horizontal solo en móvil; en desktop va en el rail derecho */}
        <div className="mx-auto max-w-6xl px-3 pb-2 sm:px-5 lg:hidden">
          <PortalNav orientation="horizontal" />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 sm:px-6">
        <main className="min-w-0 flex-1 py-8 sm:py-10">{children}</main>

        {/* Navbar al lado derecho (desktop) */}
        <aside className="hidden shrink-0 py-8 lg:block lg:w-[208px] sm:py-10">
          <div className="sticky top-24">
            <PortalNav orientation="vertical" />
          </div>
        </aside>
      </div>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-[11px] tracking-wide text-muted-foreground/70">
        Portal privado de {studioName} · Solo tú puedes ver esta información.
      </footer>
    </div>
  )
}
