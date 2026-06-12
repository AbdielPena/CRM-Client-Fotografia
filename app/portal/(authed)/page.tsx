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
import { cn } from "@/lib/utils/cn"

export const dynamic = "force-dynamic"

export default async function PortalHomePage() {
  // El layout ya garantizó sesión válida — pero re-leemos para tener el id.
  const raw = cookies().get(PORTAL_COOKIE_NAME)?.value
  const session = parsePortalCookieValue(raw)
  if (!session) return null

  const supabase = createSupabaseServiceClient()

  const [galRes, delivRes, invRes, payRes, bookRes, contRes] = await Promise.all([
    // Galerías del cliente (todas) + cuáles son entrega final
    supabase
      .from("galleries")
      .select("id, gallery_type")
      .eq("client_id", session.clientId)
      .is("deleted_at", null),
    // Entregas manuales (client_deliveries) ya entregadas/vistas
    supabase
      .from("client_deliveries")
      .select("id, status")
      .eq("client_id", session.clientId)
      .is("deleted_at", null),
    supabase
      .from("invoices")
      .select("id, total, amount_paid, status, currency, due_date")
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const galleriesAll = (galRes.data ?? []) as any[]
  const galleryCount = galleriesAll.length
  const finalDeliveryGalleries = galleriesAll.filter(
    (g) => g.gallery_type === "final_delivery",
  ).length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manualDeliveries = ((delivRes.data ?? []) as any[]).filter(
    (d) => d.status === "delivered" || d.status === "reviewed",
  ).length
  // "Entregas" del cliente = galerías de entrega final + entregas manuales listas.
  const deliveryCount = finalDeliveryGalleries + manualDeliveries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (payRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = (contRes.data ?? []) as any[]

  const pendingInvoices = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "void",
  )
  // Saldo real = total − pagado (no el total completo). Una factura pagada a la
  // mitad debe mostrar solo lo que falta.
  const totalDue = pendingInvoices.reduce(
    (s, i) => s + Math.max(0, Number(i.total ?? 0) - Number(i.amount_paid ?? 0)),
    0,
  )
  const totalPaid = payments
    .filter((p) => p.status === "completed" || p.status === "succeeded")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const currency = invoices[0]?.currency ?? "USD"

  const hasOverdue = totalDue > 0

  const cards: Array<{
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string
    sub?: string
    tint: string
    border?: string
  }> = [
    {
      href: "/portal/galleries",
      icon: ImageIcon,
      label: "Galerías",
      value: String(galleryCount),
      sub: galleryCount === 0 ? "Aún sin galerías" : "para ver tus fotos",
      tint: "bg-brand-soft text-gold-600",
    },
    {
      href: "/portal/deliveries",
      icon: PackageIcon,
      label: "Entregas",
      value: String(deliveryCount),
      sub:
        deliveryCount === 0 ? "aún sin entregas" : "fotos editadas finales",
      tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    },
    {
      href: "/portal/invoices",
      icon: Receipt,
      label: "Pendiente de pago",
      value: formatCurrency(totalDue, currency),
      sub:
        pendingInvoices.length === 0
          ? "todo al día"
          : `${pendingInvoices.length} factura${pendingInvoices.length === 1 ? "" : "s"}`,
      tint: hasOverdue
        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
      border: hasOverdue ? "border-amber-300/70" : undefined,
    },
    {
      href: "/portal/payments",
      icon: CreditCard,
      label: "Pagado",
      value: formatCurrency(totalPaid, currency),
      sub: `${payments.length} pago${payments.length === 1 ? "" : "s"}`,
      tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    },
    {
      href: "/portal/contracts",
      icon: FileText,
      label: "Contratos",
      value: String(contracts.length),
      sub: contracts.some((c) => c.status === "signed") ? "firmado" : "pendientes",
      tint: "bg-brand-soft text-gold-600",
    },
    {
      href: "/portal/bookings",
      icon: CalendarCheck,
      label: "Reservas",
      value: String(bookings.length),
      sub: bookings[0]?.event_date
        ? `próxima: ${formatDateShort(new Date(bookings[0].event_date))}`
        : undefined,
      tint: "bg-brand-soft text-gold-600",
    },
  ]

  return (
    <div className="space-y-8">
      <header className="animate-fade-in-up">
        <p className="lx-overline mb-2">Tu espacio</p>
        <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-[40px]">
          Bienvenida a tu <span className="text-gold-600">portal</span>
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Aquí tienes todo lo relacionado con tu experiencia: galerías, entregas,
          contratos, facturas y pagos.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <Link
            key={c.href}
            href={c.href}
            className={cn(
              "lx-card lx-card-hover group animate-fade-in-up p-5",
              c.border,
            )}
            style={{ animationDelay: `${Math.min(i * 60, 360)}ms` }}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  c.tint,
                )}
              >
                <c.icon className="h-[18px] w-[18px]" />
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:translate-x-1 group-hover:text-gold-600" />
            </div>
            <p className="lx-overline mt-4">{c.label}</p>
            <p className="mt-1.5 font-serif-soft text-[26px] font-medium leading-none tabular-nums text-foreground">
              {c.value}
            </p>
            {c.sub && (
              <p className="mt-2 text-[13px] text-muted-foreground">{c.sub}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
