import { notFound } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import { getInvoiceById } from "@/server/services/invoice.service"
import { getTaxConfig } from "@/server/services/fiscal-ncf.service"
import { getFinAccountsWithBalances } from "@/server/services/fin-account.service"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { StatusBadge } from "@/components/shared/status-badge"
import { InvoiceDetailActions } from "@/components/invoices/invoice-detail-actions"
import { IssueNcfButton } from "@/components/invoices/issue-ncf-button"
import { RecordPaymentForm } from "@/components/invoices/record-payment-form"
import { WhatsAppSendMenu } from "@/components/whatsapp/whatsapp-send-menu"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"
import type { NcfType } from "@/lib/fiscal"
import { Receipt, CreditCard, Printer, Pencil, Layers } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detalle de factura" }

type Rec = Record<string, unknown>

function pickFirst(v: unknown): Rec | null {
  if (!v) return null
  if (Array.isArray(v)) return (v[0] as Rec | undefined) ?? null
  return v as Rec
}

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  async function loadDefaultAccountId(): Promise<string | null> {
    try {
      const { data } = await supabase
        .from("studios")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("default_finance_account_id" as any)
        .eq("id", session.studioId)
        .maybeSingle()
      return (
        (data as { default_finance_account_id: string | null } | null)
          ?.default_finance_account_id ?? null
      )
    } catch {
      return null
    }
  }

  type FinAccountList = Awaited<ReturnType<typeof getFinAccountsWithBalances>>
  async function loadFinAccounts(): Promise<FinAccountList> {
    try {
      return await getFinAccountsWithBalances(session.studioId, { activaOnly: true })
    } catch {
      return []
    }
  }

  const [invoiceRaw, unread, taxConfig, finAccounts, defaultAccountId] = await Promise.all([
    getInvoiceById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
    getTaxConfig(session.studioId).catch(() => null),
    loadFinAccounts(),
    loadDefaultAccountId(),
  ])
  const invoice = invoiceRaw as Rec | null

  if (!invoice) notFound()

  const accountOptions = finAccounts.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    bancoNombre: a.banco?.nombre ?? null,
    currency: a.currency,
  }))

  const client = pickFirst(invoice.client)
  const project = pickFirst(invoice.project)
  const items = (invoice.items ?? []) as Rec[]
  const payments = (invoice.payments ?? []) as Rec[]

  // Fiscal NCF state (campos agregados por migration 20260520000100_fiscal_init.sql)
  const ncf = (invoice.ncf as string | null) ?? null
  const ncfType = (invoice.ncf_type as NcfType | null) ?? null
  const clientDocNumber =
    (client?.document_number as string | undefined) ??
    (client?.rnc as string | undefined) ??
    null
  const hasClientRnc = !!clientDocNumber

  const currency = (invoice.currency as string | null) ?? "DOP"
  const fmt = (n: number) => formatCurrency(n, currency)

  const subtotal = Number(invoice.subtotal ?? 0)
  const discount = Number(invoice.discount_amount ?? 0)
  const tax = Number(invoice.tax_amount ?? 0)
  const total = Number(invoice.total ?? 0)
  const amountPaid = Number(invoice.amount_paid ?? 0)
  const balance = total - amountPaid

  // WhatsApp de 1 clic (cobranza)
  const waPhone = (client?.phone as string | null) ?? null
  const waVars = {
    clienteNombre: (client?.name as string | undefined) ?? null,
    factura: (invoice.invoice_number as string | null) ?? null,
    saldo: balance > 0 ? fmt(balance) : null,
    link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/i/${invoice.id}`,
  }

  // Plan de pago: la factura del booking se cobra en 2 cuotas (reserva + balance)
  // dentro del mismo registro. installment_total define cuántas cuotas.
  const metadata = (invoice.metadata as Rec | null) ?? {}
  const installmentTotal = Number(invoice.installment_total ?? 1)
  const depositPercent =
    metadata?.deposit_percent != null
      ? Number(metadata.deposit_percent)
      : installmentTotal >= 2
        ? 50
        : 0

  type Cuota = {
    n: number
    label: string
    amount: number
    state: "paid" | "partial" | "pending"
    paid: number
  }
  let plan: Cuota[] = []
  if (installmentTotal >= 2 && total > 0) {
    const pct = depositPercent > 0 && depositPercent < 100 ? depositPercent : 50
    let raw: { label: string; amount: number }[]
    if (installmentTotal === 2) {
      const c1 = Math.round(total * pct) / 100
      raw = [
        { label: `Reserva (${pct}%)`, amount: Math.min(c1, total) },
        { label: "Balance restante", amount: Math.round((total - Math.min(c1, total)) * 100) / 100 },
      ]
    } else {
      const base = Math.round((total / installmentTotal) * 100) / 100
      raw = Array.from({ length: installmentTotal }, (_, i) => ({
        label: `Cuota ${i + 1}`,
        amount: i === installmentTotal - 1 ? Math.round((total - base * (installmentTotal - 1)) * 100) / 100 : base,
      }))
    }
    let remaining = amountPaid
    plan = raw.map((r, i) => {
      let state: Cuota["state"] = "pending"
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
      return { n: i + 1, label: r.label, amount: r.amount, state, paid }
    })
  }
  const depositQuickFill = plan.length > 0 ? plan[0].amount : 0

  const status = invoice.status as string
  const invoiceNumber = invoice.invoice_number as string
  const dueDate = invoice.due_date as string | null
  const sentAt = invoice.sent_at as string | null
  const paidAt = invoice.paid_at as string | null
  const createdAt = invoice.created_at as string

  return (
    <>
      <AppTopbar
        eyebrow="Facturas"
        title={`Factura ${invoiceNumber}`}
        description={`${(client?.name as string | undefined) ?? "Sin cliente"} · ${(project?.name as string | undefined) ?? "Sin proyecto"}`}
        unreadNotifications={unread}
        actions={
          <>
            <StatusBadge status={status} />
            <WhatsAppSendMenu
              phone={waPhone}
              vars={waVars}
              only={["recordar_pago", "recordar_balance", "recordar_reserva"]}
            />
            <IssueNcfButton
              invoiceId={invoice.id as string}
              currentNcf={ncf}
              currentNcfType={ncfType}
              defaultNcfType={(taxConfig?.default_ncf_type as NcfType | null) ?? undefined}
              hasClientRnc={hasClientRnc}
            />
            {status !== "cancelled" && (
              <Link
                href={`/invoices/${invoice.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Link>
            )}
            <Link
              href={`/invoice-print/${invoice.id}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir / PDF
            </Link>
            <InvoiceDetailActions
              invoice={{
                id: invoice.id as string,
                invoice_number: invoiceNumber,
                status,
              }}
            />
          </>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice document */}
        <div className="lg:col-span-2 space-y-6">
          <div className="sf-card overflow-hidden">
            {/* Invoice header */}
            <div className="px-8 pt-8 pb-6 border-b border-border/60">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                    <span className="font-mono text-sm font-bold text-foreground">
                      {invoiceNumber}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{fmt(total)}</p>
                  {dueDate && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Vence el {formatDate(new Date(dueDate))}
                    </p>
                  )}
                </div>
                <StatusBadge status={status} />
              </div>
            </div>

            {/* Parties */}
            <div className="px-8 py-6 grid grid-cols-2 gap-6 border-b border-border/60">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Facturado a</p>
                <p className="font-semibold text-foreground">
                  {(client?.name as string | undefined) ?? "—"}
                </p>
                {client?.email ? (
                  <p className="text-sm text-muted-foreground">{String(client.email)}</p>
                ) : null}
                {client?.phone ? (
                  <p className="text-sm text-muted-foreground">{String(client.phone)}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Proyecto</p>
                {project ? (
                  <Link
                    href={`/projects/${String(project.id)}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {String(project.name)}
                  </Link>
                ) : (
                  <span className="font-semibold text-foreground">—</span>
                )}
              </div>
            </div>

            {/* Line items */}
            <div className="px-8 py-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground uppercase">
                    <th className="text-left pb-3 font-medium">Descripción</th>
                    <th className="text-right pb-3 font-medium w-16">Qty</th>
                    <th className="text-right pb-3 font-medium w-28">Precio</th>
                    <th className="text-right pb-3 font-medium w-28">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {items.map((item) => (
                    <tr key={String(item.id)}>
                      <td className="py-3 text-foreground">{String(item.description ?? "")}</td>
                      <td className="py-3 text-right text-foreground/80">
                        {Number(item.quantity)}
                      </td>
                      <td className="py-3 text-right text-foreground/80">
                        {fmt(Number(item.unit_price))}
                      </td>
                      <td className="py-3 text-right font-medium text-foreground">
                        {fmt(Number(item.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="mt-6 flex justify-end">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between text-foreground/80">
                    <span>Subtotal</span>
                    <span>{fmt(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-danger">
                      <span>Descuento</span>
                      <span>-{fmt(discount)}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between text-foreground/80">
                      <span>Impuestos</span>
                      <span>{fmt(tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
                    <span>Total</span>
                    <span>{fmt(total)}</span>
                  </div>
                  {amountPaid > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-600">
                        <span>Pagado</span>
                        <span>-{fmt(amountPaid)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-border">
                        <span>Saldo pendiente</span>
                        <span>{fmt(balance)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes ? (
              <div className="px-8 py-5 border-t border-border/60 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Notas</p>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                  {String(invoice.notes)}
                </p>
              </div>
            ) : null}
          </div>

          {/* Plan de pago (cuotas dentro de la misma factura) */}
          {plan.length > 0 && (
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Plan de pago · {installmentTotal} cuotas
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Esta factura se cobra en {installmentTotal} pagos parciales dentro del mismo registro.
              </p>
              <div className="space-y-2.5">
                {plan.map((c) => {
                  const chip =
                    c.state === "paid"
                      ? { label: "Pagada", cls: "bg-emerald-100 text-emerald-700" }
                      : c.state === "partial"
                        ? { label: "Abono parcial", cls: "bg-amber-100 text-amber-700" }
                        : { label: "Pendiente", cls: "bg-muted text-muted-foreground" }
                  return (
                    <div
                      key={c.n}
                      className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.state === "partial"
                            ? `Abonado ${fmt(c.paid)} de ${fmt(c.amount)}`
                            : c.state === "paid"
                              ? "Pago recibido"
                              : "Por cobrar"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">
                          {fmt(c.amount)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${chip.cls}`}
                        >
                          {chip.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Payment history */}
          {payments.length > 0 && (
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Historial de pagos</h2>
              </div>
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={String(payment.id)}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {fmt(Number(payment.amount))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {String(payment.method ?? "")
                          .toLowerCase()
                          .replace(/_/g, " ")}
                        {payment.received_at
                          ? ` · ${formatDateShort(new Date(String(payment.received_at)))}`
                          : ""}
                        {payment.transaction_reference
                          ? ` · Ref: ${String(payment.transaction_reference)}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={String(payment.status)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Record payment */}
          {!["paid", "cancelled"].includes(status) && (
            <RecordPaymentForm
              invoiceId={invoice.id as string}
              balance={balance}
              currency={currency}
              depositAmount={depositQuickFill}
              accounts={accountOptions}
              defaultAccountId={defaultAccountId}
            />
          )}

          {/* Invoice meta */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Información</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Creada</dt>
                <dd className="text-foreground">
                  {formatDateShort(new Date(createdAt))}
                </dd>
              </div>
              {sentAt && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Enviada</dt>
                  <dd className="text-foreground">
                    {formatDateShort(new Date(sentAt))}
                  </dd>
                </div>
              )}
              {paidAt && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Pagada</dt>
                  <dd className="text-emerald-600 font-medium">
                    {formatDateShort(new Date(paidAt))}
                  </dd>
                </div>
              )}
              {dueDate && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Vence</dt>
                  <dd className="text-foreground">
                    {formatDateShort(new Date(dueDate))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
