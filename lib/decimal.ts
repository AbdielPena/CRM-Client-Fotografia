// ============================================================================
// Helpers Decimal.js — wrappers para cálculos monetarios safe
//
// Toda operación monetaria del monolito (NCF/ITBIS, transactions, payments,
// balances) DEBE pasar por estos helpers. NUNCA usar `Number()` o aritmética
// nativa en JS para dinero — rounding errors causan auditoría rota.
//
// Convention: storage en Postgres = `numeric(14,2)` (string en JSON).
//             cómputo en TS = Decimal.
//             render en UI = Decimal.toFixed(2) → "1234.56"
// ============================================================================

import Decimal from "decimal.js"

// Configuración global: redondear HALF_EVEN (banker's rounding) para uniformidad.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_EVEN })

/** Crea un Decimal seguro desde input mixto. Si es null/undefined → 0. */
export function d(input: number | string | Decimal | null | undefined): Decimal {
  if (input === null || input === undefined || input === "") return new Decimal(0)
  return new Decimal(input)
}

/** Suma una lista de valores → string "XXXX.XX". */
export function sum(values: Array<number | string | Decimal | null | undefined>): string {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0)).toFixed(2)
}

/** Multiplica → string "XXXX.XX". */
export function mul(
  a: number | string | Decimal,
  b: number | string | Decimal,
): string {
  return d(a).times(d(b)).toFixed(2)
}

/** Resta → string "XXXX.XX". */
export function sub(
  a: number | string | Decimal,
  b: number | string | Decimal,
): string {
  return d(a).minus(d(b)).toFixed(2)
}

/** Divide → string "XXXX.XX". Si divisor=0 → "0.00". */
export function div(
  a: number | string | Decimal,
  b: number | string | Decimal,
): string {
  const divisor = d(b)
  if (divisor.isZero()) return "0.00"
  return d(a).div(divisor).toFixed(2)
}

/** Aplica porcentaje: percent(100, 18) → "18.00". */
export function percent(
  base: number | string | Decimal,
  rate: number | string | Decimal,
): string {
  return d(base).times(d(rate)).div(100).toFixed(2)
}

/** Compara: gte, lte, eq. Devuelven boolean. */
export function gte(a: number | string | Decimal, b: number | string | Decimal): boolean {
  return d(a).gte(d(b))
}
export function lte(a: number | string | Decimal, b: number | string | Decimal): boolean {
  return d(a).lte(d(b))
}
export function eq(a: number | string | Decimal, b: number | string | Decimal): boolean {
  return d(a).eq(d(b))
}

/** Format friendly (siempre 2 decimals, separador de miles opcional). */
export function format(
  value: number | string | Decimal,
  opts: { thousands?: boolean; currency?: string } = {},
): string {
  const fixed = d(value).toFixed(2)
  if (!opts.thousands) {
    return opts.currency ? `${opts.currency} ${fixed}` : fixed
  }
  const [int, frac] = fixed.split(".")
  const withThousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const result = `${withThousands}.${frac}`
  return opts.currency ? `${opts.currency} ${result}` : result
}

/** Re-export Decimal para casos avanzados (cadenas de operaciones). */
export { Decimal }
