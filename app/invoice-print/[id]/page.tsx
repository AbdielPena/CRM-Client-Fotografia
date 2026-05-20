/**
 * Página print-friendly de factura.
 * Auth: studio member O cliente del portal con factura matching client_id.
 * El user genera el PDF con Ctrl+P → "Guardar como PDF".
 */

import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { ContractPrintActions } from "@/components/contracts/contract-print-actions"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Factura — versión imprimible" }

function fmt(n: number | string | null | undefined, currency = "USD") {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return ""
  try {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(v)
  } catch {
    return `${currency} ${v.toFixed(2)}`
  }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return ""
  try {
    return new Intl.DateTimeFormat("es", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(d))
  } catch {
    return d
  }
}

async function checkStudioAccess(studioId: string): Promise<boolean> {
  try {
    const session = await requireStudioAuth()
    return session.studioId === studioId
  } catch {
    return false
  }
}

export default async function InvoicePrintPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseServiceClient()
  const { data: invRaw } = await supabase
    .from("invoices")
    .select(
      `id, studio_id, client_id, project_id, invoice_number, title, description,
       subtotal, tax_rate, tax_amount, discount_amount, total, amount_paid,
       balance_due, currency, status, due_date, issued_at, paid_at, notes,
       installment_number, installment_total, created_at,
       client:clients(name, email, phone, address, city, country)`,
    )
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle()
  if (!invRaw) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invRaw as any

  // Auth
  const isStudio = await checkStudioAccess(inv.studio_id as string)
  const portalSession = parsePortalCookieValue(
    cookies().get(PORTAL_COOKIE_NAME)?.value,
  )
  const isClient =
    portalSession && portalSession.clientId === inv.client_id
  if (!isStudio && !isClient) notFound()

  // Studio
  const { data: studioRow } = await supabase
    .from("studios")
    .select("name, logo_url, address, phone, email, invoice_footer, tax_id")
    .eq("id", inv.studio_id as string)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studio = studioRow as any

  // F4 Fiscal RD: cargar tax_config si existe (RNC + razón social DGII).
  // Si la migration fiscal_init no se aplicó aún, esto devuelve null y la
  // factura se renderiza sin sección DGII (compatibilidad backward).
  // Cast a any porque types no conocen fiscal_tax_configs hasta regenerar.
  type TaxConfigShape = {
    rnc: string | null
    business_name: string | null
    itbis_rate: number | string
  }
  let taxConfig: TaxConfigShape | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = supabase as any
    const { data: tc } = await sbAny
      .from("fiscal_tax_configs")
      .select("rnc, business_name, itbis_rate")
      .eq("studio_id", inv.studio_id as string)
      .maybeSingle()
    taxConfig = (tc as TaxConfigShape | null) ?? null
  } catch {
    // tabla no existe (migration no aplicada) — render sin DGII info
  }

  // Pagos asociados
  const { data: paymentsRaw } = await supabase
    .from("payments")
    .select("id, amount, currency, payment_date, method, status")
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (paymentsRaw ?? []) as any[]

  // Items de la factura (si tiene tabla invoice_items, los cargamos; si no, omitimos)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = []
  try {
    const { data: itemsRaw } = await supabase
      .from("invoice_items")
      .select("description, quantity, unit_price, total")
      .eq("invoice_id", params.id)
      .order("sort_order", { ascending: true })
    items = (itemsRaw ?? []) as unknown[] as typeof items
  } catch {
    items = []
  }

  const client = inv.client && !Array.isArray(inv.client) ? inv.client : Array.isArray(inv.client) ? inv.client[0] : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cl = client as any

  return (
    <div className="bg-white min-h-screen">
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .invoice-page { box-shadow: none !important; padding: 0 !important; }
        }
        body { background: #f4f4f5; color: #18181b; }
        .invoice-page {
          max-width: 210mm;
          margin: 24px auto;
          background: white;
          padding: 32px 36px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          border-radius: 4px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          font-size: 13px;
          color: #27272a;
        }
        .invoice-header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #18181b; margin-bottom: 24px; }
        .invoice-header h1 { font-size: 22px; margin: 0; letter-spacing: .04em; text-transform: uppercase; color: #18181b; }
        .invoice-meta { font-size: 12px; color: #71717a; }
        .invoice-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .party h2 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #71717a; margin: 0 0 4px; font-weight: 600; }
        .party p { margin: 1px 0; font-size: 12.5px; }
        .invoice-table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 12.5px; }
        .invoice-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; color: #71717a; font-weight: 600; padding: 8px 6px; border-bottom: 1px solid #e4e4e7; }
        .invoice-table td { padding: 10px 6px; border-bottom: 1px solid #f4f4f5; }
        .invoice-table .num { text-align: right; font-variant-numeric: tabular-nums; }
        .totals { margin-left: auto; width: 280px; }
        .totals .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12.5px; }
        .totals .row.total { border-top: 2px solid #18181b; padding-top: 10px; margin-top: 6px; font-weight: 700; font-size: 14px; }
        .totals .row.balance { color: #b45309; font-weight: 600; }
        .invoice-footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e4e4e7; font-size: 11px; color: #71717a; text-align: center; }
        .status-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
        .status-paid { background: #d1fae5; color: #065f46; }
        .status-overdue { background: #fee2e2; color: #991b1b; }
        .status-pending { background: #fef3c7; color: #92400e; }
        .status-default { background: #e4e4e7; color: #3f3f46; }
      `}</style>

      <div className="no-print mx-auto max-w-[210mm] px-4 pt-4">
        <ContractPrintActions />
      </div>

      <article className="invoice-page">
        <header className="invoice-header">
          <div>
            <h1>Factura</h1>
            <p className="invoice-meta" style={{ marginTop: 4 }}>
              <strong>#{inv.invoice_number ?? String(inv.id).slice(0, 8)}</strong>
              {inv.installment_total ? ` · cuota ${inv.installment_number}/${inv.installment_total}` : ""}
            </p>

            {/* F4 Fiscal RD: NCF prominente arriba para cumplir reglamento DGII.
                El NCF debe ser visible y único por documento. */}
            {inv.ncf && (
              <p
                className="ncf-display"
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  background: "#fef3c7",
                  border: "1px solid #f59e0b",
                  borderRadius: 4,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#92400e",
                  display: "inline-block",
                }}
              >
                NCF: {inv.ncf}
                {inv.ncf_type && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 400,
                      color: "#78350f",
                      fontFamily: "inherit",
                    }}
                  >
                    Tipo {inv.ncf_type}
                  </span>
                )}
              </p>
            )}
            <p className="invoice-meta" style={{ marginTop: 2 }}>
              {inv.issued_at && <>Emitida {fmtDate(inv.issued_at)}</>}
              {inv.due_date && <> · vence {fmtDate(inv.due_date)}</>}
            </p>
            <p style={{ marginTop: 6 }}>
              <span
                className={`status-pill ${
                  inv.status === "paid"
                    ? "status-paid"
                    : inv.status === "overdue"
                      ? "status-overdue"
                      : inv.status === "pending" || inv.status === "sent"
                        ? "status-pending"
                        : "status-default"
                }`}
              >
                {inv.status}
              </span>
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            {studio?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studio.logo_url}
                alt={studio.name}
                style={{ maxHeight: 56, maxWidth: 140, objectFit: "contain", marginLeft: "auto" }}
              />
            ) : null}
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#52525b" }}>
              <strong>{studio?.name ?? ""}</strong>
            </p>
            {studio?.address && (
              <p style={{ margin: "1px 0", fontSize: 11, color: "#71717a" }}>
                {studio.address}
              </p>
            )}
            {/* F4: RNC del tax_config tiene prioridad (configuración DGII formal),
                fallback a tax_id legacy. business_name es la razón social fiscal. */}
            {taxConfig?.business_name && (
              <p style={{ margin: "1px 0", fontSize: 11, color: "#71717a", fontWeight: 600 }}>
                {taxConfig.business_name}
              </p>
            )}
            {(taxConfig?.rnc || studio?.tax_id) && (
              <p style={{ margin: "1px 0", fontSize: 11, color: "#71717a" }}>
                RNC: {taxConfig?.rnc ?? studio.tax_id}
              </p>
            )}
          </div>
        </header>

        <section className="invoice-parties">
          <div className="party">
            <h2>Facturado a</h2>
            <p style={{ fontWeight: 600, fontSize: 14 }}>{cl?.name ?? "—"}</p>
            {cl?.email && <p>{cl.email}</p>}
            {cl?.phone && <p>{cl.phone}</p>}
            {cl?.address && <p>{cl.address}</p>}
            {(cl?.city || cl?.country) && (
              <p>{[cl.city, cl.country].filter(Boolean).join(", ")}</p>
            )}
          </div>
          <div className="party">
            <h2>De</h2>
            <p style={{ fontWeight: 600, fontSize: 14 }}>{studio?.name ?? "—"}</p>
            {studio?.email && <p>{studio.email}</p>}
            {studio?.phone && <p>{studio.phone}</p>}
          </div>
        </section>

        {inv.title && (
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
            {inv.title}
          </p>
        )}
        {inv.description && (
          <p style={{ fontSize: 12.5, color: "#52525b", marginBottom: 16 }}>
            {inv.description}
          </p>
        )}

        {items.length > 0 ? (
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="num" style={{ width: 80 }}>Cant.</th>
                <th className="num" style={{ width: 110 }}>Precio</th>
                <th className="num" style={{ width: 120 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>{it.description}</td>
                  <td className="num">{Number(it.quantity ?? 1)}</td>
                  <td className="num">{fmt(it.unit_price, inv.currency)}</td>
                  <td className="num">{fmt(it.total, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="num" style={{ width: 140 }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{inv.title ?? "Servicios profesionales"}</td>
                <td className="num">{fmt(inv.subtotal ?? inv.total, inv.currency)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="totals">
          <div className="row">
            <span>Subtotal</span>
            <span>{fmt(inv.subtotal ?? inv.total, inv.currency)}</span>
          </div>
          {Number(inv.discount_amount ?? 0) > 0 && (
            <div className="row">
              <span>Descuento</span>
              <span>− {fmt(inv.discount_amount, inv.currency)}</span>
            </div>
          )}
          {Number(inv.tax_amount ?? 0) > 0 && (
            <div className="row">
              <span>
                Impuestos
                {inv.tax_rate ? ` (${Number(inv.tax_rate)}%)` : ""}
              </span>
              <span>{fmt(inv.tax_amount, inv.currency)}</span>
            </div>
          )}
          {/* F4: ITBIS DGII desglose si la invoice tiene itbis_amount/rate
              de la migration fiscal_init (columnas agregadas en F1). */}
          {Number(inv.itbis_amount ?? 0) > 0 && (
            <div className="row" style={{ color: "#92400e" }}>
              <span>
                ITBIS
                {inv.itbis_rate ? ` (${Number(inv.itbis_rate)}%)` : ""}
              </span>
              <span>{fmt(inv.itbis_amount, inv.currency)}</span>
            </div>
          )}
          <div className="row total">
            <span>Total</span>
            <span>{fmt(inv.total, inv.currency)}</span>
          </div>
          {Number(inv.amount_paid ?? 0) > 0 && (
            <div className="row" style={{ color: "#15803d" }}>
              <span>Pagado</span>
              <span>− {fmt(inv.amount_paid, inv.currency)}</span>
            </div>
          )}
          {Number(inv.balance_due ?? 0) > 0 && (
            <div className="row balance">
              <span>Saldo pendiente</span>
              <span>{fmt(inv.balance_due, inv.currency)}</span>
            </div>
          )}
        </div>

        {payments.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 11, textTransform: "uppercase", color: "#71717a", margin: "0 0 6px" }}>
              Historial de pagos
            </h2>
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.payment_date)}</td>
                    <td style={{ textTransform: "uppercase" }}>{p.method ?? "—"}</td>
                    <td className="num">{fmt(p.amount, p.currency ?? inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {inv.notes && (
          <div style={{ marginTop: 24, padding: 12, background: "#fafafa", borderRadius: 4, fontSize: 12.5, color: "#52525b" }}>
            <strong style={{ color: "#27272a" }}>Notas:</strong> {inv.notes}
          </div>
        )}

        <footer className="invoice-footer">
          {/* F4: Leyenda DGII si el invoice tiene NCF asignado.
              Texto reglamentado para comprobantes fiscales en RD. */}
          {inv.ncf && (
            <div
              style={{
                marginBottom: 8,
                padding: "8px 10px",
                background: "#fef3c7",
                border: "1px solid #fbbf24",
                borderRadius: 4,
                color: "#92400e",
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              <p style={{ margin: 0 }}>
                COMPROBANTE FISCAL · DGII República Dominicana
              </p>
              <p style={{ margin: "2px 0 0", fontFamily: "ui-monospace, monospace" }}>
                NCF: {inv.ncf} · Tipo {inv.ncf_type ?? "B02"}
                {taxConfig?.rnc && ` · RNC Emisor: ${taxConfig.rnc}`}
              </p>
              <p style={{ margin: "2px 0 0", fontWeight: 400, fontSize: 9 }}>
                Este comprobante es válido como factura fiscal. Conserve este
                documento para deducir gastos según normativa DGII.
              </p>
            </div>
          )}
          {studio?.invoice_footer ?? `${studio?.name ?? ""} · ${studio?.email ?? ""}`}
        </footer>
      </article>
    </div>
  )
}
