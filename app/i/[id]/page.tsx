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
       studio_id, client_id, project_id`,
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

  const accent = studio?.primary_color ?? "#7c3aed"
  const totalFormatted = formatMoney(invoice.total, invoice.currency ?? "DOP")
  const paidFormatted = formatMoney(invoice.amount_paid ?? 0, invoice.currency ?? "DOP")
  const balanceFormatted = formatMoney(
    invoice.balance_due ?? invoice.total,
    invoice.currency ?? "DOP",
  )
  const status = invoice.status as string
  const isPaid = status === "paid"
  const isOverdue = !isPaid && invoice.due_date && new Date(invoice.due_date) < new Date()

  const installmentLabel =
    invoice.installment_number && invoice.installment_total
      ? `Cuota ${invoice.installment_number} de ${invoice.installment_total}`
      : null

  return (
    <div className="min-h-screen bg-neutral-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {studio?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={studio.logo_url}
              alt={studio.name ?? "Studio"}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold"
              style={{ background: accent }}
            >
              {(studio?.name ?? "S").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Factura · {studio?.name ?? "Studio"}
            </div>
            <div className="font-semibold text-neutral-900">{invoice.invoice_number}</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          {/* Banner de estado */}
          <div
            className="px-6 py-4 flex items-center justify-between text-white"
            style={{ background: isPaid ? "#10b981" : isOverdue ? "#ef4444" : accent }}
          >
            <div>
              <div className="text-xs opacity-90">
                {isPaid ? "Factura pagada" : isOverdue ? "Factura vencida" : "Pago pendiente"}
              </div>
              <div className="text-xl font-semibold mt-0.5">{totalFormatted}</div>
            </div>
            {installmentLabel && (
              <div className="text-xs bg-white/20 px-3 py-1 rounded-full">{installmentLabel}</div>
            )}
          </div>

          {/* Detalles */}
          <div className="p-6 space-y-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                Facturado a
              </div>
              <div className="text-neutral-900 font-medium">{client?.name ?? "—"}</div>
              {client?.email && <div className="text-sm text-neutral-500">{client.email}</div>}
            </div>

            {project && (
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                  Proyecto
                </div>
                <div className="text-neutral-900 font-medium">{project.name}</div>
                <div className="text-sm text-neutral-500">
                  {formatEventType(project.event_type)}
                  {project.event_date && ` · ${formatDate(project.event_date)}`}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-100">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                  Total
                </div>
                <div className="text-neutral-900 font-semibold">{totalFormatted}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                  Pagado
                </div>
                <div className="text-neutral-900 font-semibold">{paidFormatted}</div>
              </div>
              {invoice.due_date && !isPaid && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                    Vence
                  </div>
                  <div className="text-neutral-900 font-semibold">
                    {formatDate(invoice.due_date)}
                  </div>
                </div>
              )}
              {!isPaid && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                    Saldo
                  </div>
                  <div
                    className="font-semibold"
                    style={{ color: isOverdue ? "#ef4444" : accent }}
                  >
                    {balanceFormatted}
                  </div>
                </div>
              )}
              {invoice.paid_at && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                    Pagada el
                  </div>
                  <div className="text-neutral-900 font-semibold">
                    {formatDate(invoice.paid_at)}
                  </div>
                </div>
              )}
            </div>

            {/* CTA contrato pendiente */}
            {contract && contract.status !== "signed" && !isPaid && (
              <Link
                href={`/sign/${contract.signing_token}`}
                className="block w-full text-center rounded-xl px-4 py-3 text-white font-medium hover:opacity-90 transition"
                style={{ background: accent }}
              >
                Revisar y firmar contrato →
              </Link>
            )}
          </div>
        </div>

        {/* Info de pago */}
        {!isPaid && (
          <div className="mt-6 text-sm text-neutral-600 text-center">
            Para coordinar el pago, contacta directamente a {studio?.name ?? "tu fotógrafo"}
            {client?.email && " respondiendo al correo"}.
          </div>
        )}

        <div className="mt-10 text-center text-xs text-neutral-400">
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
