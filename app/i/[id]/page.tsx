import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { createSupabaseServiceClient } from "@/server/supabase/service"

export const metadata: Metadata = { title: "Factura" }

/**
 * Ruta pública de factura — accedida desde el email automático.
 *
 * Seguridad: el invoice.id es un UUID v4, impracticable de adivinar.
 * Es una capability URL (como las de Stripe, Google Drive). Cuando
 * se necesite endurecer, se agrega `invoices.public_token` via migración
 * y se cambia la lookup acá.
 */
export default async function PublicInvoicePage({
  params,
}: {
  params: { id: string }
}) {
  // Usamos service client porque las RLS actuales no permiten anon leer invoices.
  // La protección es el UUID impracticable-de-adivinar.
  const supabase = createSupabaseServiceClient()

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, total, currency, due_date, issued_at,
       installment_number, installment_total, paid_at, amount_paid, balance_due,
       metadata, studio_id, client_id, project_id`,
    )
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!invoice) notFound()

  const [studioRes, clientRes, projectRes, contractRes] = await Promise.all([
    supabase
      .from("studios")
      .select("name, logo_url, primary_color")
      .eq("id", invoice.studio_id)
      .maybeSingle(),
    supabase.from("clients").select("name, email").eq("id", invoice.client_id).maybeSingle(),
    supabase
      .from("projects")
      .select("name, event_type, event_date")
      .eq("id", invoice.project_id)
      .maybeSingle(),
    supabase
      .from("contracts")
      .select("signing_token, status")
      .eq("project_id", invoice.project_id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
  ])

  const studio = studioRes.data
  const client = clientRes.data
  const project = projectRes.data
  const contract = contractRes.data

  const currency = invoice.currency ?? "DOP"
  const totalNum = Number(invoice.total ?? 0)
  const paidNum = Number(invoice.amount_paid ?? 0)
  const balanceNum = Math.max(totalNum - paidNum, 0)
  const totalFormatted = formatMoney(totalNum, currency)
  const paidFormatted = formatMoney(paidNum, currency)
  const balanceFormatted = formatMoney(balanceNum, currency)
  const status = invoice.status as string
  const isPaid = status === "paid"
  const isOverdue = !isPaid && invoice.due_date && new Date(invoice.due_date) < new Date()

  const installmentLabel =
    invoice.installment_number && invoice.installment_total
      ? `Cuota ${invoice.installment_number} de ${invoice.installment_total}`
      : null

  // Plan de pago: cuotas dentro de la misma factura (reserva + balance)
  const metadata =
    (invoice.metadata as Record<string, unknown> | null) ?? {}
  const installmentTotal = Number(invoice.installment_total ?? 1)
  const depositPercent =
    metadata?.deposit_percent != null
      ? Number(metadata.deposit_percent)
      : installmentTotal >= 2
        ? 50
        : 0
  type PublicCuota = { label: string; amount: number; state: "paid" | "partial" | "pending"; paid: number }
  let plan: PublicCuota[] = []
  if (installmentTotal >= 2 && totalNum > 0) {
    const pct = depositPercent > 0 && depositPercent < 100 ? depositPercent : 50
    const c1 = Math.min(Math.round(totalNum * pct) / 100, totalNum)
    const raw =
      installmentTotal === 2
        ? [
            { label: `Reserva (${pct}%)`, amount: c1 },
            { label: "Balance restante", amount: Math.round((totalNum - c1) * 100) / 100 },
          ]
        : Array.from({ length: installmentTotal }, (_, i) => {
            const base = Math.round((totalNum / installmentTotal) * 100) / 100
            return {
              label: `Cuota ${i + 1}`,
              amount: i === installmentTotal - 1 ? Math.round((totalNum - base * (installmentTotal - 1)) * 100) / 100 : base,
            }
          })
    let remaining = paidNum
    plan = raw.map((r) => {
      let state: PublicCuota["state"] = "pending"
      let paid = 0
      if (r.amount > 0 && remaining >= r.amount) {
        state = "paid"
        paid = r.amount
        remaining -= r.amount
      } else if (remaining > 0) {
        state = "partial"
        paid = remaining
        remaining = 0
      }
      return { label: r.label, amount: r.amount, state, paid }
    })
  }

  const bannerClass = isPaid
    ? "from-emerald-500 to-emerald-600"
    : isOverdue
      ? "from-red-500 to-red-600"
      : "from-gold-500 to-gold-600"

  return (
    <div className="client-luxe relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          {studio?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={studio.logo_url}
              alt={studio.name ?? "Studio"}
              className="h-11 w-11 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 font-serif font-semibold text-white">
              {(studio?.name ?? "S").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="lx-overline">Factura · {studio?.name ?? "Studio"}</div>
            <div className="font-serif text-lg font-semibold text-foreground">
              {invoice.invoice_number}
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="lx-card animate-fade-in-up overflow-hidden p-0">
          {/* Banner de estado */}
          <div
            className={`flex items-center justify-between bg-gradient-to-br px-6 py-5 text-white ${bannerClass}`}
          >
            <div>
              <div className="text-xs opacity-90">
                {isPaid ? "Factura pagada" : isOverdue ? "Factura vencida" : "Pago pendiente"}
              </div>
              <div className="mt-0.5 font-serif-soft text-3xl font-semibold">
                {totalFormatted}
              </div>
            </div>
            {installmentLabel && (
              <div className="rounded-full bg-white/20 px-3 py-1 text-xs">{installmentLabel}</div>
            )}
          </div>

          {/* Detalles */}
          <div className="space-y-5 p-6">
            <div>
              <div className="lx-overline mb-1">Facturado a</div>
              <div className="font-medium text-foreground">{client?.name ?? "—"}</div>
              {client?.email && (
                <div className="text-sm text-muted-foreground">{client.email}</div>
              )}
            </div>

            {project && (
              <div>
                <div className="lx-overline mb-1">Proyecto</div>
                <div className="font-medium text-foreground">{project.name}</div>
                <div className="text-sm text-muted-foreground">
                  {formatEventType(project.event_type)}
                  {project.event_date && ` · ${formatDate(project.event_date)}`}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div>
                <div className="lx-overline mb-1">Total</div>
                <div className="font-semibold tabular-nums text-foreground">{totalFormatted}</div>
              </div>
              <div>
                <div className="lx-overline mb-1">Pagado</div>
                <div className="font-semibold tabular-nums text-foreground">{paidFormatted}</div>
              </div>
              {invoice.due_date && !isPaid && (
                <div>
                  <div className="lx-overline mb-1">Vence</div>
                  <div className="font-semibold text-foreground">
                    {formatDate(invoice.due_date)}
                  </div>
                </div>
              )}
              {!isPaid && (
                <div>
                  <div className="lx-overline mb-1">Saldo</div>
                  <div
                    className={`font-serif-soft text-xl font-semibold tabular-nums ${
                      isOverdue ? "text-red-600" : "text-gold-700"
                    }`}
                  >
                    {balanceFormatted}
                  </div>
                </div>
              )}
              {invoice.paid_at && (
                <div>
                  <div className="lx-overline mb-1">Pagada el</div>
                  <div className="font-semibold text-foreground">
                    {formatDate(invoice.paid_at)}
                  </div>
                </div>
              )}
            </div>

            {/* Plan de pago (cuotas dentro de la misma factura) */}
            {plan.length > 0 && (
              <div className="border-t border-border pt-4">
                <div className="lx-overline mb-2">Plan de pago · {installmentTotal} cuotas</div>
                <div className="space-y-2">
                  {plan.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-2.5"
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">{c.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.state === "paid"
                            ? "Pagada"
                            : c.state === "partial"
                              ? `Abonado ${formatMoney(c.paid, currency)}`
                              : "Pendiente"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatMoney(c.amount, currency)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            c.state === "paid"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : c.state === "partial"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {c.state === "paid" ? "Pagada" : c.state === "partial" ? "Parcial" : "Pendiente"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA contrato pendiente */}
            {contract && contract.status !== "signed" && !isPaid && (
              <Link href={`/sign/${contract.signing_token}`} className="lx-btn-gold w-full">
                Revisar y firmar contrato →
              </Link>
            )}
          </div>
        </div>

        {/* Info de pago */}
        {!isPaid && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Para coordinar el pago, contacta directamente a {studio?.name ?? "tu fotógrafo"}
            {client?.email && " respondiendo al correo"}.
          </div>
        )}

        <div className="mt-10 text-center text-[11px] tracking-wide text-muted-foreground/60">
          Enviado por {studio?.name ?? "StudioFlow"}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────

function formatMoney(amount: number | string, currency: string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount
  const formatted = new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)
  return `${currency} ${formatted}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-DO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function formatEventType(type: string | null | undefined): string {
  if (!type) return ""
  const map: Record<string, string> = {
    quinceanera: "XV años",
    wedding: "Boda",
    engagement: "Pre-boda",
    maternity: "Maternidad",
    newborn: "Newborn",
    family: "Familiar",
    portrait: "Retrato",
    graduation: "Graduación",
    corporate: "Corporativo",
    event: "Evento",
  }
  return map[type] ?? type.replace(/_/g, " ")
}
