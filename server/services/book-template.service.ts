import "server-only"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Biblioteca de plantillas del Luxury Book (Fase 3). Un diseño reutilizable
 * (portada + colores + patrón de páginas) por estudio. Tabla `book_templates`
 * (untyped: no está en los tipos generados). Acceso solo por service-role.
 */

export interface BookTemplate {
  id: string
  name: string
  config: Record<string, unknown>
  createdAt: string
}

export async function getBookTemplates(studioId: string): Promise<BookTemplate[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("book_templates")
    .select("id, name, config, created_at")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    config: (r.config ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  }))
}

export async function createBookTemplate(
  studioId: string,
  name: string,
  config: Record<string, unknown>,
): Promise<{ id: string }> {
  const sb = untypedService()
  const { data, error } = await sb
    .from("book_templates")
    .insert({ studio_id: studioId, name: name.trim().slice(0, 120) || "Plantilla", config })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return { id: (data as { id: string }).id }
}

export async function deleteBookTemplate(studioId: string, id: string): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("book_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("studio_id", studioId)
  if (error) throw new Error(error.message)
}
