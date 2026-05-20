import "server-only"

import { untypedServer } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"

/**
 * Generador de reportes DGII para República Dominicana.
 *
 * Formato 606 (Compras de bienes y servicios):
 *   Reporte de TODOS los gastos del studio con NCF de proveedores que tengan
 *   B01 (Crédito Fiscal) o B14/B15 (regímenes especiales). Sirve para que
 *   los proveedores justifiquen su ITBIS pagado.
 *
 * Formato 607 (Ventas):
 *   Reporte de TODAS las facturas que el studio emitió con NCF en el mes.
 *   DGII verifica que las ventas reportadas matchen los NCFs efectivamente
 *   emitidos vs el rango autorizado.
 *
 * Output: TSV (tab-separated, formato DGII oficial). El user descarga el .txt
 * y lo sube manualmente al portal DGII (no hay API pública).
 *
 * Columnas formato 606:
 *   RNC | Tipo Bienes/Servicios | NCF | NCF Modificado | Fecha Comprobante |
 *   Fecha Pago | Monto Servicios | Monto Bienes | Monto Total | ITBIS Facturado |
 *   ITBIS Retenido | ITBIS Sujeto a Proporcionalidad | ITBIS Llevado al Costo |
 *   ITBIS por Adelantar | ITBIS Percibido | Retención Renta | ISR Percibido |
 *   Impuesto Selectivo al Consumo | Otros Impuestos/Tasas | Monto Propina Legal |
 *   Forma de Pago
 *
 * Columnas formato 607:
 *   RNC/Cédula | Tipo Identificación | NCF | NCF Modificado | Tipo de Ingreso |
 *   Fecha Comprobante | Fecha Retención | Monto Facturado | ITBIS Facturado |
 *   ITBIS Retenido por Terceros | ITBIS Percibido | Retención Renta por Terceros |
 *   ISR Percibido | Impuesto Selectivo al Consumo | Otros Impuestos/Tasas |
 *   Monto Propina Legal | Efectivo | Cheque/Transferencia/Depósito |
 *   Tarjeta Débito/Crédito | Venta a Crédito | Bonos/Certificados de Regalo |
 *   Permuta | Otras Formas de Venta
 */

export type Report607Row = {
  rnc: string
  tipoIdentificacion: "1" | "2" // 1=RNC, 2=Cédula
  ncf: string
  ncfModificado: string
  tipoIngreso: string
  fechaComprobante: string // YYYYMMDD
  fechaRetencion: string
  montoFacturado: string // numeric(14,2)
  itbisFacturado: string
  itbisRetenido: string
  itbisPercibido: string
  retencionRenta: string
  isrPercibido: string
  selectivoConsumo: string
  otrosImpuestos: string
  propinaLegal: string
  efectivo: string
  chequeTransferencia: string
  tarjetaDebito: string
  ventaCredito: string
  bonosCertificados: string
  permuta: string
  otrasFormas: string
}

export type Report606Row = {
  rnc: string
  tipoBienesServicios: string // 01..18
  ncf: string
  ncfModificado: string
  fechaComprobante: string
  fechaPago: string
  montoServicios: string
  montoBienes: string
  montoTotal: string
  itbisFacturado: string
  itbisRetenido: string
  itbisSujetoProporcionalidad: string
  itbisLlevadoCosto: string
  itbisPorAdelantar: string
  itbisPercibido: string
  retencionRenta: string
  isrPercibido: string
  selectivoConsumo: string
  otrosImpuestos: string
  propinaLegal: string
  formaPago: string
}

export type ReportSummary = {
  period: string // YYYY-MM
  rows: number
  totalAmount: string
  totalItbis: string
}

/**
 * Genera reporte 607 (Ventas) — facturas emitidas con NCF en el periodo.
 *
 * @param studioId — UUID del studio
 * @param period — "YYYY-MM" (ej "2026-05")
 */
export async function generateReport607(
  studioId: string,
  period: string,
): Promise<{ rows: Report607Row[]; summary: ReportSummary }> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error("INVALID_PERIOD_FORMAT")
  }

  const sb = untypedServer()
  const periodStart = `${period}-01`
  const [year, month] = period.split("-").map(Number)
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`

  // Cargar invoices con NCF emitidas en el periodo
  const { data: invoices, error } = await sb
    .from("invoices")
    .select(
      `id, invoice_number, ncf, ncf_type, total, itbis_amount, itbis_rate,
       currency, sent_at, paid_at, status, client_id,
       client:clients(name, document_number, rnc, document_type)`,
    )
    .eq("studio_id", studioId)
    .not("ncf", "is", null)
    .gte("sent_at", periodStart)
    .lt("sent_at", nextMonth)
    .is("deleted_at", null)
    .order("sent_at", { ascending: true })

  if (error) throwServiceError("FISCAL_REPORT_607_FAILED", error, { studioId, period })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (invoices ?? []) as any[]

  const rows: Report607Row[] = items.map((inv) => {
    const client = Array.isArray(inv.client) ? inv.client[0] : inv.client
    const rnc = client?.rnc ?? client?.document_number ?? ""
    // tipoIdentificacion: 1=RNC (9 dígitos), 2=Cédula (11 dígitos)
    const tipoId: "1" | "2" = String(rnc).replace(/\D/g, "").length === 9 ? "1" : "2"

    const fechaComp = inv.sent_at
      ? new Date(inv.sent_at).toISOString().slice(0, 10).replace(/-/g, "")
      : ""

    const total = Number(inv.total ?? 0).toFixed(2)
    const itbis = Number(inv.itbis_amount ?? 0).toFixed(2)

    return {
      rnc: rnc || "",
      tipoIdentificacion: tipoId,
      ncf: inv.ncf,
      ncfModificado: "",
      tipoIngreso: "02", // 02 = Ingresos por Operaciones (default; user puede override)
      fechaComprobante: fechaComp,
      fechaRetencion: "",
      montoFacturado: total,
      itbisFacturado: itbis,
      itbisRetenido: "0.00",
      itbisPercibido: "0.00",
      retencionRenta: "0.00",
      isrPercibido: "0.00",
      selectivoConsumo: "0.00",
      otrosImpuestos: "0.00",
      propinaLegal: "0.00",
      // Forma de pago según status — simplificado
      efectivo: inv.status === "paid" && !inv.payment_method ? total : "0.00",
      chequeTransferencia: "0.00",
      tarjetaDebito: "0.00",
      ventaCredito: inv.status === "sent" || inv.status === "overdue" ? total : "0.00",
      bonosCertificados: "0.00",
      permuta: "0.00",
      otrasFormas: "0.00",
    }
  })

  const totalAmount = rows
    .reduce((acc, r) => acc + Number(r.montoFacturado), 0)
    .toFixed(2)
  const totalItbis = rows
    .reduce((acc, r) => acc + Number(r.itbisFacturado), 0)
    .toFixed(2)

  return {
    rows,
    summary: {
      period,
      rows: rows.length,
      totalAmount,
      totalItbis,
    },
  }
}

/**
 * Genera reporte 606 (Compras) — gastos con NCF de proveedores en el periodo.
 *
 * Basa el reporte en `fin_payables` que tengan NCF (TODO V2: agregar columna
 * ncf_proveedor a fin_payables) o en `fin_transactions tipo='gasto'` que
 * tengan external_reference apuntando a un payable con NCF.
 *
 * En MVP devolvemos rows vacíos — F4 V2 agregará la columna fin_payables.ncf
 * y este service hará la query real.
 */
export async function generateReport606(
  studioId: string,
  period: string,
): Promise<{ rows: Report606Row[]; summary: ReportSummary }> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error("INVALID_PERIOD_FORMAT")
  }

  // MVP: rows vacíos. V2 implementará la query real cuando fin_payables
  // tenga columna ncf + rnc del proveedor.
  return {
    rows: [],
    summary: {
      period,
      rows: 0,
      totalAmount: "0.00",
      totalItbis: "0.00",
    },
  }
}

/**
 * Convierte un Report607Row[] al formato TSV oficial DGII.
 * El user descarga este string como archivo .txt y lo sube al portal DGII.
 */
export function format607ToTSV(rows: Report607Row[]): string {
  const lines = rows.map((r) =>
    [
      r.rnc,
      r.tipoIdentificacion,
      r.ncf,
      r.ncfModificado,
      r.tipoIngreso,
      r.fechaComprobante,
      r.fechaRetencion,
      r.montoFacturado,
      r.itbisFacturado,
      r.itbisRetenido,
      r.itbisPercibido,
      r.retencionRenta,
      r.isrPercibido,
      r.selectivoConsumo,
      r.otrosImpuestos,
      r.propinaLegal,
      r.efectivo,
      r.chequeTransferencia,
      r.tarjetaDebito,
      r.ventaCredito,
      r.bonosCertificados,
      r.permuta,
      r.otrasFormas,
    ].join("|"),
  )
  return lines.join("\n")
}

export function format606ToTSV(rows: Report606Row[]): string {
  const lines = rows.map((r) =>
    [
      r.rnc,
      r.tipoBienesServicios,
      r.ncf,
      r.ncfModificado,
      r.fechaComprobante,
      r.fechaPago,
      r.montoServicios,
      r.montoBienes,
      r.montoTotal,
      r.itbisFacturado,
      r.itbisRetenido,
      r.itbisSujetoProporcionalidad,
      r.itbisLlevadoCosto,
      r.itbisPorAdelantar,
      r.itbisPercibido,
      r.retencionRenta,
      r.isrPercibido,
      r.selectivoConsumo,
      r.otrosImpuestos,
      r.propinaLegal,
      r.formaPago,
    ].join("|"),
  )
  return lines.join("\n")
}
