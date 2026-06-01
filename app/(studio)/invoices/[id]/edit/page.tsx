import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getInvoiceById } from "@/server/services/invoice.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { InvoiceBuilder, type InvoiceBuilderInitial } from "@/components/invoices/invoice-builder"

export const metadata: Metadata = { title: "Editar factura" }

type Rec = Record<string, unknown>

function pickFirst(v: unknown): Rec | null {
  if (!v) return null
  if (Array.isArray(v)) return (v[0] as Rec | undefined) ?? null
  return v as Rec
}

export default async function EditInvoicePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const [invoiceRaw, unread] = await Promise.all([
    getInvoiceById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])
  const invoice = invoiceRaw as Rec | null
  if (!invoice) notFound()

  const status = invoice.status as string
  if (status === "cancelled") notFound()

  const client = pickFirst(invoice.client)
  const project = pickFirst(invoice.project)
  const items = (invoice.items ?? []) as Rec[]
  const metadata = (invoice.metadata as Rec | null) ?? {}

  const installmentTotal = Number(invoice.installment_total ?? 1)
  const depositPercentMeta = metadata?.deposit_percent
  const depositPercent =
    depositPercentMeta != null
      ? Number(depositPercentMeta)
      : installmentTotal >= 2
        ? 50
        : 0

  const initial: InvoiceBuilderInitial = {
    projectName: (project?.name as string | undefined) ?? "—",
    clientName: (client?.name as string | undefined) ?? "—",
    dueDate: (invoice.due_date as string | null) ?? "",
    currency: (invoice.currency as string | null) ?? "DOP",
    discount: 0, // descuento se recalcula por %; el monto guardado no se reproyecta
    depositPercent,
    notes: (invoice.notes as string | null) ?? "",
    items:
      items.length > 0
        ? items.map((it) => ({
            description: String(it.description ?? ""),
            quantity: Number(it.quantity ?? 1),
            unitPrice: Number(it.unit_price ?? 0),
            taxRate: 0,
          }))
        : undefined,
  }

  return (
    <>
      <AppTopbar
        eyebrow="Facturas"
        title={`Editar factura ${invoice.invoice_number as string}`}
        description="Modifica ítems, montos y la reserva. El cliente recibirá el cambio por correo."
        unreadNotifications={unread}
      />
      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <InvoiceBuilder
          mode="edit"
          invoiceId={invoice.id as string}
          invoiceNumber={invoice.invoice_number as string}
          projects={[]}
          clients={[]}
          initial={initial}
        />
      </div>
    </>
  )
}
