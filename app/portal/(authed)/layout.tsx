import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  LayoutDashboard,
  ImageIcon,
  Receipt,
  CreditCard,
  CalendarCheck,
  FileText,
  Package as PackageIcon,
  LogOut,
} from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { PortalLogoutButton } from "@/components/portal/portal-logout-button"

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

  const nav = [
    { href: "/portal", label: "Inicio", icon: LayoutDashboard },
    { href: "/portal/galleries", label: "Galerías", icon: ImageIcon },
    { href: "/portal/deliveries", label: "Entregas", icon: PackageIcon },
    { href: "/portal/contracts", label: "Contratos", icon: FileText },
    { href: "/portal/invoices", label: "Facturas", icon: Receipt },
    { href: "/portal/payments", label: "Pagos", icon: CreditCard },
    { href: "/portal/bookings", label: "Reservas", icon: CalendarCheck },
  ]

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {c.studios?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.studios.logo_url}
                alt={c.studios.name}
                className="h-8 w-8 rounded-md object-cover"
              />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-md bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                {(c.studios?.name ?? "S").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {c.studios?.name ?? "Tu portal"}
              </p>
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                Hola, {c.name}
              </p>
            </div>
          </div>
          <PortalLogoutButton />
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 py-6 text-center text-[11px] text-zinc-400">
        Portal privado — solo vos podés ver esta información.
        <span className="mx-1">·</span>
        <LogOut className="inline h-3 w-3" /> Cerrá sesión cuando termines.
      </footer>
    </div>
  )
}
