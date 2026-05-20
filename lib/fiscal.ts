// ============================================================================
// Helpers fiscales — República Dominicana (NCF, ITBIS, RNC)
//
// Portado de studioflow-platform/packages/lib/fiscal.ts (sin Prisma).
// Funciones puras, sin side-effects, safe en server + client.
//
// Tipos NCF reglamentados por DGII:
//   B01–B04: facturación directa
//   B11–B17: regímenes especiales
// ============================================================================

import Decimal from "decimal.js"

/**
 * NCF type codes (DGII).
 */
export type NcfType =
  | "B01" // Crédito Fiscal (RNC required)
  | "B02" // Consumo (sin RNC)
  | "B03" // Nota de Débito
  | "B04" // Nota de Crédito
  | "B11" // Comprobante de Compras
  | "B12" // Registro Único de Ingresos
  | "B13" // Gastos Menores
  | "B14" // Régimen Especial
  | "B15" // Gubernamental
  | "B16" // Exportaciones
  | "B17" // Pagos al Exterior

export const NCF_TYPES: NcfType[] = [
  "B01", "B02", "B03", "B04",
  "B11", "B12", "B13", "B14", "B15", "B16", "B17",
]

export const NCF_TYPE_LABELS: Record<NcfType, string> = {
  B01: "Crédito Fiscal",
  B02: "Consumo",
  B03: "Nota de Débito",
  B04: "Nota de Crédito",
  B11: "Comprobante de Compras",
  B12: "Registro Único de Ingresos",
  B13: "Gastos Menores",
  B14: "Régimen Especial",
  B15: "Gubernamental",
  B16: "Exportaciones",
  B17: "Pagos al Exterior",
}

/**
 * Tipos NCF que REQUIEREN RNC del receptor (no consumo final).
 */
export const NCF_REQUIRES_RNC: ReadonlySet<NcfType> = new Set([
  "B01", "B03", "B14", "B15", "B16",
])

/**
 * Valida un RNC (9 dígitos) o cédula dominicana (11 dígitos).
 * Acepta con o sin guiones/espacios; normaliza solo dígitos.
 */
export function isValidDocumentNumber(doc: string): boolean {
  const clean = doc.replace(/[-\s]/g, "")
  if (!/^\d+$/.test(clean)) return false
  return clean.length === 9 || clean.length === 11
}

/**
 * Normaliza un RNC/cédula quitando separadores. NO valida — usa `isValidDocumentNumber`.
 */
export function normalizeDocumentNumber(doc: string): string {
  return doc.replace(/[-\s]/g, "")
}

/**
 * Formatea NCF a string completo: PREFIX + secuencia 8 dígitos padding 0.
 * Ej: formatNcf("B02", 42) → "B0200000042"
 */
export function formatNcf(prefix: string, sequence: number): string {
  if (sequence < 0) throw new Error("NCF sequence cannot be negative")
  return `${prefix}${String(sequence).padStart(8, "0")}`
}

/**
 * Parsea NCF string a (prefix, sequence). Devuelve null si formato inválido.
 */
export function parseNcf(ncf: string): { prefix: NcfType; sequence: number } | null {
  const m = /^([A-Z]\d{2})(\d{8})$/.exec(ncf.trim())
  if (!m) return null
  const prefix = m[1] as NcfType
  if (!NCF_TYPES.includes(prefix)) return null
  return { prefix, sequence: parseInt(m[2], 10) }
}

/**
 * ITBIS rates reglamentados (DGII RD).
 */
export type ItbisRate = 0 | 16 | 18
export const ITBIS_RATES: ItbisRate[] = [0, 16, 18]
export const ITBIS_DEFAULT_RATE: ItbisRate = 18

/**
 * Calcula ITBIS de una línea: (precio * cantidad - descuento) * rate.
 * Usa Decimal.js para evitar rounding floats.
 *
 * @returns objeto con subtotal, itbis_amount, total (todos como string para serializar a numeric(14,2))
 */
export function computeLineTotals(args: {
  unitPrice: number | string | Decimal
  quantity: number | string | Decimal
  discount?: number | string | Decimal
  itbisRate?: ItbisRate
}): { subtotal: string; itbisAmount: string; total: string } {
  const unitPrice = new Decimal(args.unitPrice)
  const quantity = new Decimal(args.quantity)
  const discount = new Decimal(args.discount ?? 0)
  const rate = new Decimal(args.itbisRate ?? ITBIS_DEFAULT_RATE).div(100)

  const gross = unitPrice.times(quantity)
  const subtotal = gross.minus(discount)
  const itbisAmount = subtotal.times(rate)
  const total = subtotal.plus(itbisAmount)

  return {
    subtotal: subtotal.toFixed(2),
    itbisAmount: itbisAmount.toFixed(2),
    total: total.toFixed(2),
  }
}

/**
 * Suma totales de un set de líneas. Útil para consolidar invoice totals.
 */
export function sumInvoiceTotals(
  lines: Array<{ subtotal: string | number; itbisAmount: string | number; total: string | number }>,
): { subtotal: string; itbisAmount: string; total: string } {
  let subtotal = new Decimal(0)
  let itbisAmount = new Decimal(0)
  let total = new Decimal(0)
  for (const line of lines) {
    subtotal = subtotal.plus(new Decimal(line.subtotal))
    itbisAmount = itbisAmount.plus(new Decimal(line.itbisAmount))
    total = total.plus(new Decimal(line.total))
  }
  return {
    subtotal: subtotal.toFixed(2),
    itbisAmount: itbisAmount.toFixed(2),
    total: total.toFixed(2),
  }
}
