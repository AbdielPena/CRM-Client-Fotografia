"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/server/middleware/auth"
import {
  updateDeliveryStatus,
  type DeliveryStatus,
} from "@/server/services/delivery.service"

const VALID: DeliveryStatus[] = [
  "pendiente",
  "en_edicion",
  "lista",
  "entregada",
  "retrasada",
]

export async function updateDeliveryStatusAction(
  deliveryId: string,
  status: string,
) {
  const session = await requireRole("staff")
  if (!VALID.includes(status as DeliveryStatus)) {
    return { error: "Estado inválido" }
  }
  await updateDeliveryStatus(session.studioId, deliveryId, status as DeliveryStatus)
  revalidatePath("/deliveries")
  revalidatePath("/dashboard")
  return { success: true }
}
