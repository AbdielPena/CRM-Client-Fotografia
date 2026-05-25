"use client"

import { useTransition } from "react"
import { CreditCard, Loader2, ExternalLink } from "lucide-react"

import { openCustomerPortalAction } from "@/server/actions/billing.actions"
import { Button } from "@/components/ui/button"

export function BillingActions({
  hasCustomerId,
  currentStatus,
}: {
  hasCustomerId: boolean
  currentStatus: string
}) {
  const [isPending, startTransition] = useTransition()

  async function handlePortal() {
    startTransition(async () => {
      try {
        await openCustomerPortalAction()
      } catch (err) {
        console.error(err)
      }
    })
  }

  if (!hasCustomerId) {
    return null
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <Button
        onClick={handlePortal}
        disabled={isPending}
        variant="outline"
        size="sm"
      >
        {isPending ? (
          <Loader2 className="mr-1 size-3.5 animate-spin" />
        ) : (
          <CreditCard className="mr-1 size-3.5" />
        )}
        Gestionar facturación
        <ExternalLink className="ml-1 size-3" />
      </Button>
      <p className="text-[10px] text-muted-foreground">
        Cancela, cambia método de pago, descarga facturas — todo en Stripe.
      </p>
    </div>
  )
}
