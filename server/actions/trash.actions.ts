"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  restoreEntity,
  permanentlyDeleteEntity,
  type TrashEntityType,
} from "@/server/services/trash.service"

const ROUTES_TO_REVALIDATE: Record<TrashEntityType, string[]> = {
  project: ["/projects", "/clients", "/trash"],
  contract: ["/contracts", "/trash"],
  invoice: ["/invoices", "/trash"],
  gallery: ["/galleries", "/trash"],
  delivery: ["/deliveries", "/trash"],
}

/**
 * Restaura una entidad desde el trash. La entidad vuelve a su listado
 * principal con su cascada (proyectos restauran sus contratos, facturas
 * y galerías, etc).
 */
export async function restoreFromTrashAction(
  entityType: TrashEntityType,
  entityId: string,
) {
  const session = await requireStudioAuth()
  await restoreEntity(session.studioId, session.userId, entityType, entityId)
  for (const path of ROUTES_TO_REVALIDATE[entityType]) {
    revalidatePath(path)
  }
  return { ok: true as const }
}

/**
 * Elimina PERMANENTEMENTE una entidad del trash. Borra de la base de datos
 * la entidad y todas sus dependencias. Irreversible. Solo admin/owner.
 */
export async function permanentlyDeleteFromTrashAction(
  entityType: TrashEntityType,
  entityId: string,
) {
  const session = await requireStudioAuth()
  if (session.role !== "admin" && session.role !== "owner") {
    throw new Error("FORBIDDEN_ROLE")
  }
  await permanentlyDeleteEntity(
    session.studioId,
    session.userId,
    entityType,
    entityId,
  )
  for (const path of ROUTES_TO_REVALIDATE[entityType]) {
    revalidatePath(path)
  }
  return { ok: true as const }
}
