"use client"

import { useEffect } from "react"

/**
 * Cliente abre la entrega → marca como reviewed (best-effort, fire-and-forget).
 */
export function PortalDeliveryReviewMarker({
  deliveryId,
  alreadyReviewed,
}: {
  deliveryId: string
  alreadyReviewed: boolean
}) {
  useEffect(() => {
    if (alreadyReviewed) return
    void fetch(`/api/portal/deliveries/${deliveryId}/review`, {
      method: "POST",
    }).catch(() => {})
  }, [deliveryId, alreadyReviewed])

  return null
}
