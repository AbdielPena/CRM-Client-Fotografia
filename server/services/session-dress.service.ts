import "server-only"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Vestido seleccionado por el cliente para su sesión (quinceañera): se guarda
 * en columnas de `projects` (dress_name/provider/cost/notes). El costo entra en
 * el cálculo interno de ganancia (precio − vestido − colaboradores).
 */
export async function setSessionDress(
  studioId: string,
  projectId: string,
  data: {
    dressName: string
    dressProvider: string
    dressCost: number | null
    dressNotes: string
  },
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("projects")
    .update({
      dress_name: data.dressName.trim() || null,
      dress_provider: data.dressProvider.trim() || null,
      dress_cost: data.dressCost,
      dress_notes: data.dressNotes.trim() || null,
    })
    .eq("id", projectId)
    .eq("studio_id", studioId)
  if (error) throw new Error(error.message)
}
