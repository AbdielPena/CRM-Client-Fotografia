import { cookies } from "next/headers"
import Link from "next/link"
import {
  ImageIcon,
  Receipt,
  CreditCard,
  CalendarCheck,
  FileText,
  Package as PackageIcon,
  ArrowRight,
} from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"

export const dynamic = "force-dynamic"

export default async function PortalHomePage() {
  // El layout ya garantizó sesión válida — pero re-leemos para tener el id.
  const raw = cookies().get(PORTAL_COOKIE_NAME)?.value
  const session = parsePortalCookieValue(raw)
  if (!session) return null

  const supabase = createSupabaseServiceClient()

  const [galRes, invRes, payRes, bookRes, contRes] = await Promise.all([
    supabase
      .from("galleries")
      .select("id", { count: "exact", head: true })
      .eq("client_id", session.clientId)
      .is("deleted_at", null),
    supabase
      .from("invoices")
      .select("id, total_amount, status, currency, due_date")
      .eq("client_id", session.clientId)
      .is("deleted_at", null),
    supabase
      .from("payments")
      .select("amount, status, currency")
      .eq("client_id", session.clientId),
    supabase
      .from("booking_requests")
      .select("id, status, event_date, created_at")
      .eq("client_id", session.clientId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("contracts")
      .select("id, project_id, status")
      .in(
        "project_id",
        (
          await supabase
            .from("projects")
            .select("id")
            .eq("client_id", session.clientId)
        ).data?.map((p) => (p as { id: string }).id) ?? [],
      ),
  ])

  const galleryCount = galRes.count ?? 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (payRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = (contRes.data ?? []) as any[]

  const totalDue = invoices
    .filter((i) => i.status !== "paid" && i.status !== "void")
    .reduce((s, i) => s + Number(i.total_amount ?? 0), 0)
  const totalPaid = payments
    .filter((p) => p.status === "completed" || p.status === "succeeded")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const currency = invoices[0]?.currency ?? "USD"

  const cards: Array<{
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string
    sub?: string
    accent: string
  }> = [
    {
      href: "/portal/galleries",
      icon: ImageIcon,
      label: "Galerías",
      value: String(galleryCount),
      sub: galleryCount === 0 ? "Aún sin galerías" : "para ver tus fotos",
      accent: "from-rose-500/15 to-rose-500/0 text-rose-600 dark:text-rose-400",
    },
    {
      href: "/portal/deliveries",
      icon: PackageIcon,
      label: "Entregas",
      value: "—",
      sub: "fotos editadas finales",
      accent:
        "from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400",
    },
    {
      href: "/portal/invoices",
      icon: Receipt,
      label: "Pendiente de pago",
      value: formatCurrency(totalDue, currency),
      sub: `${invoices.length} factura${invoices.length === 1 ? "" : "s"}`,
      accent:
        "from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400",
    },
    {
      href: "/portal/payments",
      icon: CreditCard,
      label: "Pagado",
      value: formatCurrency(totalPaid, currency),
      sub: `${payments.length} pago${payments.length === 1 ? "" : "s"}`,
      accent:
        "from-sky-500/15 to-sky-500/0 text-sky-600 dark:text-sky-400",
    },
    {
      href: "/portal/contracts",
      icon: FileText,
      label: "Contratos",
      value: String(contracts.length),
      sub: contracts.some((c) => c.status === "signed") ? "firmado" : "pendientes",
      accent:
        "from-violet-500/15 to-violet-500/0 text-violet-600 dark:text-violet-400",
    },
    {
      href: "/portal/bookings",
      icon: CalendarCheck,
      label: "Reservas",
      value: String(bookings.length),
      sub: bookings[0]?.event_date
        ? `próxima: ${formatDateShort(new Date(bookings[0].event_date))}`
        : undefined,
      accent:
        "from-indigo-500/15 to-indigo-500/0 text-indigo-600 dark:text-indigo-400",
    },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Tu portal
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Acá tenés todo lo relacionado con tu sesión: galerías, entregas, contratos,
          facturas y pagos.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={`group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900`}
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.accent}`}
            />
            <div className="relative flex items-center justify-between">
              <c.icon className="h-5 w-5 opacity-80" />
              <ArrowRight className="h-4 w-4 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="relative mt-4 text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {c.label}
            </p>
            <p className="relative mt-0.5 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {c.value}
            </p>
            {c.sub && (
              <p className="relative mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                {c.sub}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
