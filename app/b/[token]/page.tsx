import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { getClientBookingFlow } from "@/server/services/booking-flow.service"
import { BookingWizard } from "@/components/public/booking-wizard"

export const metadata: Metadata = { title: "Confirma tu sesión" }
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

type StepKey = "plan" | "form" | "contract" | "pay" | "done"

export default async function BookingFlowPage({
  params,
}: {
  params: { token: string }
}) {
  const flow = await getClientBookingFlow(params.token)
  if (!flow) notFound()

  if (flow.expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-foreground">
            Este enlace ya no está disponible
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu enlace de confirmación expiró o fue anulado. Contacta a tu
            fotógrafo para recibir uno nuevo.
          </p>
        </div>
      </div>
    )
  }

  // Pasos a recorrer en el wizard, según lo que falte
  const steps: StepKey[] = ["plan"]
  if (flow.pendingForm) steps.push("form")
  if (!flow.contractSigned) steps.push("contract")
  const needsPay =
    !!flow.invoice && flow.invoice.status !== "paid" && !flow.paymentNotified
  if (needsPay) steps.push("pay")
  steps.push("done")

  const finalState: "paid" | "notified" | null =
    flow.invoice?.status === "paid"
      ? "paid"
      : flow.paymentNotified
        ? "notified"
        : null

  return (
    <BookingWizard
      token={flow.signingToken}
      studio={{
        name: flow.studio.name,
        logoUrl: flow.studio.logoUrl,
        color: flow.studio.primaryColor,
      }}
      client={{ name: flow.client.name }}
      plan={flow.plan}
      steps={steps}
      pendingForm={flow.pendingForm}
      contractHtml={flow.contractHtml}
      payment={{
        instructions: flow.studio.paymentInstructions,
        whatsapp: flow.studio.paymentWhatsapp,
        invoiceId: flow.invoice?.id ?? null,
      }}
      finalState={finalState}
    />
  )
}
