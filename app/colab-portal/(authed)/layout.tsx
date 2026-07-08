import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  COLAB_COOKIE_NAME,
  parseColabCookieValue,
} from "@/server/services/collaborator-portal.service"
import { untypedService } from "@/server/supabase/untyped"
import { ColabLogoutButton } from "./logout-button"

export const dynamic = "force-dynamic"

export default async function ColabPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = parseColabCookieValue(cookies().get(COLAB_COOKIE_NAME)?.value)
  if (!session) redirect("/colab-portal/login")

  const sb = untypedService()
  const { data } = await sb
    .from("collaborators")
    .select("id, name, portal_enabled, studio:studios(name, logo_url)")
    .eq("id", session.collaboratorId)
    .is("deleted_at", null)
    .maybeSingle()

  const c = data as {
    name?: string
    portal_enabled?: boolean
    studio?: { name?: string; logo_url?: string | null } | { name?: string; logo_url?: string | null }[] | null
  } | null
  if (!c || !c.portal_enabled) redirect("/colab-portal/login")

  const studio = Array.isArray(c.studio) ? c.studio[0] : c.studio
  const studioName = studio?.name ?? "Tu estudio"
  const firstName = (c.name ?? "").split(" ")[0] || "Colaborador"

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {studio?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logo_url} alt={studioName} className="h-7 w-auto max-w-[150px] object-contain" />
            ) : (
              <span className="text-[15px] font-bold tracking-tight text-foreground">{studioName}</span>
            )}
            <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
            <p className="hidden truncate text-[12px] text-muted-foreground sm:block">
              Hola, <span className="font-medium text-foreground/80">{firstName}</span>
            </p>
          </div>
          <ColabLogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 pt-2 text-center text-[11px] text-muted-foreground/70">
        Portal del colaborador · {studioName} · Solo tú ves esta información.
      </footer>
    </div>
  )
}
