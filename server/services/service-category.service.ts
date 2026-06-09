import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import type {
  CreateServiceCategoryInput,
  UpdateServiceCategoryInput,
} from "@/lib/validations/service-category.schema"

/**
 * Categorías de Servicios: agrupan planes/proyectos/Drive por tipo de servicio
 * (Quinceañeras, Bodas, etc.). Tabla service_categories (untyped: no está en los
 * tipos generados todavía).
 */

export interface ServiceCategory {
  id: string
  name: string
  color: string
  icon: string
  description: string | null
  driveFolderName: string | null
  isActive: boolean
  sortOrder: number
}

function sanitizeFolder(s: string): string {
  return (s || "").replace(/[/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "Otros"
}

export async function getServiceCategories(studioId: string): Promise<ServiceCategory[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("service_categories")
    .select("id, name, color, icon, description, drive_folder_name, is_active, sort_order")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    description: r.description ?? null,
    driveFolderName: r.drive_folder_name ?? null,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  }))
}

export async function createServiceCategory(
  studioId: string,
  input: CreateServiceCategoryInput,
): Promise<{ id: string }> {
  const sb = untypedService()
  const { data: maxRow } = await sb
    .from("service_categories")
    .select("sort_order")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1

  const { data, error } = await sb
    .from("service_categories")
    .insert({
      studio_id: studioId,
      name: input.name.trim(),
      color: input.color,
      icon: input.icon || "tag",
      description: input.description || null,
      drive_folder_name: sanitizeFolder(input.name),
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? nextOrder,
    })
    .select("id")
    .single()
  if (error) {
    if ((error as { code?: string }).code === "23505")
      throw new Error("Ya existe una categoría con ese nombre.")
    throw error
  }
  return { id: (data as { id: string }).id }
}

export async function updateServiceCategory(
  studioId: string,
  id: string,
  input: UpdateServiceCategoryInput,
): Promise<void> {
  const sb = untypedService()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) {
    patch.name = input.name.trim()
    patch.drive_folder_name = sanitizeFolder(input.name)
  }
  if (input.color !== undefined) patch.color = input.color
  if (input.icon !== undefined) patch.icon = input.icon || "tag"
  if (input.description !== undefined) patch.description = input.description || null
  if (input.isActive !== undefined) patch.is_active = input.isActive
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
  const { error } = await sb
    .from("service_categories")
    .update(patch)
    .eq("id", id)
    .eq("studio_id", studioId)
  if (error) {
    if ((error as { code?: string }).code === "23505")
      throw new Error("Ya existe una categoría con ese nombre.")
    throw error
  }
}

/** Cuántos planes (y luego proyectos) usan esta categoría. */
export async function countCategoryReferences(
  studioId: string,
  id: string,
): Promise<{ packages: number }> {
  const sb = untypedService()
  const { count } = await sb
    .from("packages")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .eq("service_category_id", id)
    .is("deleted_at", null)
  return { packages: count ?? 0 }
}

export async function deleteServiceCategory(studioId: string, id: string): Promise<void> {
  const refs = await countCategoryReferences(studioId, id)
  if (refs.packages > 0) {
    throw new Error(
      `Esta categoría está usada en ${refs.packages} paquete(s). Reasígnalos antes de eliminarla.`,
    )
  }
  const sb = untypedService()
  await sb
    .from("service_categories")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .eq("studio_id", studioId)
}
