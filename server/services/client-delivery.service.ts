/**
 * Entregas finales del cliente — fotos editadas, archivos comprimidos,
 * enlaces externos (WeTransfer, Drive, Dropbox).
 *
 * Estados: pending → delivered → reviewed
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"

export type DeliveryFile = {
  name: string
  url: string
  size?: number
  mime?: string
}

export type ExternalLink = {
  label: string
  url: string
}

export type DeliveryStatus = "pending" | "delivered" | "reviewed"

export type DeliveryRow = {
  id: string
  studio_id: string
  client_id: string
  project_id: string | null
  gallery_id: string | null
  title: string
  description: string | null
  status: DeliveryStatus
  delivered_at: string | null
  reviewed_at: string | null
  files: DeliveryFile[]
  external_links: ExternalLink[]
  created_at: string
  updated_at: string
}

export type CreateDeliveryInput = {
  clientId: string
  projectId?: string | null
  galleryId?: string | null
  title: string
  description?: string | null
  files?: DeliveryFile[]
  externalLinks?: ExternalLink[]
}

export async function createDelivery(
  studioId: string,
  actorUserId: string,
  input: CreateDeliveryInput,
): Promise<DeliveryRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from("client_deliveries")
    .insert({
      studio_id: studioId,
      client_id: input.clientId,
      project_id: input.projectId ?? null,
      gallery_id: input.galleryId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: "pending",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: (input.files ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      external_links: (input.externalLinks ?? []) as any,
      created_by: actorUserId,
    })
    .select("*")
    .single()
  if (error) throw error
  return data as unknown as DeliveryRow
}

export async function listDeliveriesByClient(
  studioId: string,
  clientId: string,
): Promise<DeliveryRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from("client_deliveries")
    .select("*")
    .eq("studio_id", studioId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as DeliveryRow[]
}

export async function listDeliveriesForPortal(
  clientId: string,
): Promise<DeliveryRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from("client_deliveries")
    .select("*")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as DeliveryRow[]
}

export async function updateDelivery(
  studioId: string,
  deliveryId: string,
  patch: Partial<{
    title: string
    description: string | null
    files: DeliveryFile[]
    externalLinks: ExternalLink[]
  }>,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  type DeliveryUpdate = {
    title?: string
    description?: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    files?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    external_links?: any
  }
  const update: DeliveryUpdate = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.description !== undefined) update.description = patch.description
  if (patch.files !== undefined) update.files = patch.files
  if (patch.externalLinks !== undefined) update.external_links = patch.externalLinks

  const { error } = await supabase
    .from("client_deliveries")
    .update(update)
    .eq("id", deliveryId)
    .eq("studio_id", studioId)
  if (error) throw error
}

export async function setDeliveryStatus(
  studioId: string,
  deliveryId: string,
  status: DeliveryStatus,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const now = new Date().toISOString()
  const update: {
    status: DeliveryStatus
    delivered_at?: string | null
    reviewed_at?: string | null
  } = { status }
  if (status === "delivered") update.delivered_at = now
  if (status === "reviewed") update.reviewed_at = now
  if (status === "pending") {
    update.delivered_at = null
    update.reviewed_at = null
  }

  const { error } = await supabase
    .from("client_deliveries")
    .update(update)
    .eq("id", deliveryId)
    .eq("studio_id", studioId)
  if (error) throw error

  // Si la pasamos a 'delivered', dispara email + notif (best-effort)
  if (status === "delivered") {
    try {
      void (async () => {
        const { onDeliveryDelivered } = await import("./client-delivery-email.service")
        await onDeliveryDelivered(deliveryId)
      })()
    } catch (err) {
      console.error("[setDeliveryStatus] delivered email failed", err)
    }
  }
}

export async function deleteDelivery(
  studioId: string,
  deliveryId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from("client_deliveries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", deliveryId)
    .eq("studio_id", studioId)
}

/**
 * Marca como reviewed cuando el cliente la abre desde el portal.
 * Idempotente.
 */
export async function markDeliveryReviewedByClient(
  clientId: string,
  deliveryId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: row } = await supabase
    .from("client_deliveries")
    .select("id, status, reviewed_at, studio_id, client_id, title")
    .eq("id", deliveryId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!row) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any
  if (r.reviewed_at) return // ya marcado

  await supabase
    .from("client_deliveries")
    .update({ status: "reviewed", reviewed_at: new Date().toISOString() })
    .eq("id", deliveryId)

  // Notificar al studio
  await supabase.from("notifications").insert({
    studio_id: r.studio_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: "delivery_reviewed" as any,
    title: "Cliente revisó la entrega",
    body: `El cliente abrió "${r.title}".`,
    related_entity_type: "delivery",
    related_entity_id: deliveryId,
  })
}
