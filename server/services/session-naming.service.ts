import 'server-only'

import { createSupabaseServiceClient } from '@/server/supabase/service'

export type SessionPlanLabel = {
  packageName: string
  categoryName: string | null
  /** Posición del plan por PRECIO dentro de su categoría (1 = más barato). */
  rank: number | null
  /** Cuántos planes hay en la categoría. */
  total: number
  /** "[Categoría] #[N] - [Plan]" o, sin categoría, "[Plan]". */
  label: string
}

/**
 * Etiqueta del plan para nombrar la sesión de cara al cliente:
 *   "[Categoría] #[N] - [Plan]"   (N = posición por PRECIO dentro de la categoría;
 *   3 = el más caro de los 3 planes de esa categoría).
 * Si el plan no tiene categoría → solo "[Plan]".
 *
 * El número es automático: lo determina el precio dentro de la categoría
 * (`packages.service_category_id`). No requiere capturar nada a mano.
 */
export async function getSessionPlanLabel(
  studioId: string,
  packageId: string | null | undefined,
): Promise<SessionPlanLabel | null> {
  if (!packageId) return null
  // `service_category_id` / `price` en packages y la tabla `service_categories`
  // son columnas/tablas nuevas que NO están en los tipos generados de Supabase
  // (mismo caso que project.service.ts) → casteamos el cliente a any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createSupabaseServiceClient() as any

  const { data: pkg } = await sb
    .from('packages')
    .select('id, name, service_category_id')
    .eq('id', packageId)
    .maybeSingle()
  if (!pkg) return null

  const packageName =
    (pkg.name as string | null)?.trim() || 'Plan'
  const categoryId = (pkg.service_category_id as string | null) ?? null

  let categoryName: string | null = null
  let rank: number | null = null
  let total = 0

  if (categoryId) {
    const [{ data: cat }, { data: siblings }] = await Promise.all([
      sb
        .from('service_categories')
        .select('name')
        .eq('id', categoryId)
        .maybeSingle(),
      sb
        .from('packages')
        .select('id, price')
        .eq('studio_id', studioId)
        .eq('service_category_id', categoryId)
        .is('deleted_at', null)
        .order('price', { ascending: true }),
    ])
    categoryName = (cat?.name as string | null)?.trim() || null
    const arr = (siblings ?? []) as Array<{ id: string }>
    total = arr.length
    const idx = arr.findIndex((s: { id: string }) => s.id === packageId)
    if (idx >= 0) rank = idx + 1
  }

  const label =
    categoryName && rank ? `${categoryName} #${rank} - ${packageName}` : packageName

  return { packageName, categoryName, rank, total, label }
}

/** Título completo de la sesión de cara al cliente: "[Cliente] · [label]". */
export function formatSessionTitle(
  clientName: string | null | undefined,
  label: string,
): string {
  const c = (clientName ?? '').trim()
  return c ? `${c} · ${label}` : label
}
