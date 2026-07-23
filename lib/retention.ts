/**
 * Plazo de conservación de archivos: meses que las fotos locales viven en el
 * servidor tras la ENTREGA final. Al vencer, un cron las borra (Drive queda
 * como respaldo). Resolución: sesión ?? categoría ?? default.
 */
export const DEFAULT_RETENTION_MONTHS = 6

export function resolveRetentionMonths(
  projectMonths: number | null | undefined,
  categoryMonths: number | null | undefined,
): number {
  if (typeof projectMonths === "number" && projectMonths > 0) return projectMonths
  if (typeof categoryMonths === "number" && categoryMonths > 0) return categoryMonths
  return DEFAULT_RETENTION_MONTHS
}

/** Fecha de vencimiento del plazo, contada desde la entrega (delivery_ready_at). */
export function retentionExpiryDate(
  deliveryReadyAt: string | Date | null | undefined,
  months: number,
): Date | null {
  if (!deliveryReadyAt) return null
  const base = new Date(deliveryReadyAt)
  if (Number.isNaN(base.getTime())) return null
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d
}
