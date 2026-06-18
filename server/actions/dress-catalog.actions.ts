"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  createDressStore,
  updateDressStore,
  deleteDressStore,
  createDress,
  updateDress,
  deleteDress,
  setFinalDress,
} from "@/server/services/dress-catalog.service"

const storeSchema = z.object({
  name: z.string().trim().min(2, "Nombre de tienda requerido").max(120),
  contactWhatsapp: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

const dressSchema = z.object({
  storeId: z.string().uuid("Tienda inválida"),
  name: z.string().trim().min(1, "Nombre requerido").max(160),
  collection: z.string().trim().max(60).optional().nullable(),
  imageUrl: z.string().trim().max(600).optional().nullable(),
  rentalPrice: z.coerce.number().nonnegative().nullable().optional(),
  deposit: z.coerce.number().nonnegative().nullable().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
})

type Result = { success: true } | { error: string }

function ok(): Result {
  return { success: true }
}
function fail(e: unknown): Result {
  return { error: e instanceof Error ? e.message : "No se pudo guardar" }
}

// ── Tiendas ──────────────────────────────────────────────────────────────────
export async function createStoreAction(raw: unknown): Promise<Result> {
  const ctx = await requireStudioAuth()
  const p = storeSchema.safeParse(raw)
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" }
  try {
    await createDressStore(ctx.studioId, p.data)
    revalidatePath("/armario")
    return ok()
  } catch (e) {
    return fail(e)
  }
}

export async function updateStoreAction(id: string, raw: unknown): Promise<Result> {
  const ctx = await requireStudioAuth()
  const p = storeSchema.partial().safeParse(raw)
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" }
  try {
    await updateDressStore(ctx.studioId, id, p.data)
    revalidatePath("/armario")
    return ok()
  } catch (e) {
    return fail(e)
  }
}

export async function deleteStoreAction(id: string): Promise<Result> {
  const ctx = await requireStudioAuth()
  try {
    await deleteDressStore(ctx.studioId, id)
    revalidatePath("/armario")
    return ok()
  } catch (e) {
    return fail(e)
  }
}

// ── Vestidos ─────────────────────────────────────────────────────────────────
export async function createDressAction(raw: unknown): Promise<Result> {
  const ctx = await requireStudioAuth()
  const p = dressSchema.safeParse(raw)
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" }
  try {
    await createDress(ctx.studioId, p.data)
    revalidatePath("/armario")
    return ok()
  } catch (e) {
    return fail(e)
  }
}

export async function updateDressAction(id: string, raw: unknown): Promise<Result> {
  const ctx = await requireStudioAuth()
  const p = dressSchema.partial().safeParse(raw)
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" }
  try {
    await updateDress(ctx.studioId, id, p.data)
    revalidatePath("/armario")
    return ok()
  } catch (e) {
    return fail(e)
  }
}

export async function deleteDressAction(id: string): Promise<Result> {
  const ctx = await requireStudioAuth()
  try {
    await deleteDress(ctx.studioId, id)
    revalidatePath("/armario")
    return ok()
  } catch (e) {
    return fail(e)
  }
}

// ── Vestido elegido final (marcar desde el lead / armario) ───────────────────
export async function setFinalDressAction(
  token: string,
  imageUrl: string,
  isFinal: boolean,
): Promise<{ success: true; finalImages: string[] } | { error: string }> {
  const ctx = await requireStudioAuth()
  try {
    const finalImages = await setFinalDress(ctx.studioId, token, imageUrl, isFinal)
    revalidatePath("/armario")
    return { success: true, finalImages }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" }
  }
}
