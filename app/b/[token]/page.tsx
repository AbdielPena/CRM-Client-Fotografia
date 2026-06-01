import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
  Check,
  FileText,
  PenLine,
  CreditCard,
  Sparkles,
  ArrowRight,
  Clock,
} from "lucide-react"

import { getClientBookingFlow } from "@/server/services/booking-flow.service"
import { formatCurrency } from "@/lib/utils/currency"
import { BookingPaymentStep } from "@/components/public/booking-payment-step"

export const metadata: Metadata = { title: "Confirma tu sesión" }
export const dynamic = "force-dynamic"

function formatDate(d: string | null): string | null {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString("es", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  } catch {
    return d
  }
}

export default async function BookingFlowPage({
  params,
}: {
  params: { token: string }
}) {
  const flow = await getClientBookingFlow(params.token)
  if (!flow) notFound()

  const color = flow.studio.primaryColor
  const selfUrl = `/b/${params.token}`

  if (flow.expired) {
    return (
      <Shell studioName={flow.studio.name} color={color} logoUrl={flow.studio.logoUrl}>
        <div className="text-center">
          <h1 className="mb-2 text-xl font-bold">Este enlace ya no está disponible</h1>
          <p className="text-sm text-muted-foreground">
            Tu enlace de confirmación expiró o fue anulado. Contacta a tu fotógrafo
            para recibir uno nuevo.
          </p>
        </div>
      </Shell>
    )
  }

  const eventDate = formatDate(flow.plan.eventDate)
  const firstName = flow.client.name.split(" ")[0] || "Hola"
  const hasForm = flow.forms.length > 0
  const pendingForm = flow.forms.find(
    (f) => f.status !== "completed" && f.status !== "expired",
  )

  // Pasos para el indicador de progreso
  const steps = [
    ...(hasForm ? [{ key: "form", label: "Cuestionario", icon: FileText }] : []),
    { key: "sign", label: "Contrato", icon: PenLine },
    { key: "pay", label: "Pago", icon: CreditCard },
  ]
  const stepIndex = (() => {
    if (flow.currentStep === "form") return 0
    if (flow.currentStep === "sign") return hasForm ? 1 : 0
    if (flow.currentStep === "pay") return hasForm ? 2 : 1
    return steps.length // done
  })()

  return (
    <Shell studioName={flow.studio.name} color={color} logoUrl={flow.studio.logoUrl}>
      {/* Bienvenida */}
      <div className="mb-5 text-center">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: `${color}1a` }}
        >
          <Sparkles className="h-6 w-6" style={{ color }} />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {flow.currentStep === "done" ? "¡Listo!" : `¡Hola, ${firstName}!`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {flow.currentStep === "done"
            ? flow.invoice?.status === "paid"
              ? "Tu sesión está confirmada. ¡Te esperamos!"
              : "Recibimos tu aviso de pago."
            : "Tu solicitud fue aprobada. Completemos tu reserva."}
        </p>
      </div>

      {/* Indicador de progreso */}
      {flow.currentStep !== "done" && (
        <div className="mb-5 flex items-center justify-center gap-2">
          {steps.map((s, i) => {
            const done = i < stepIndex
            const active = i === stepIndex
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                  style={{
                    background: done ? "#10b981" : active ? color : "#d1d5db",
                  }}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className="h-0.5 w-6"
                    style={{ background: done ? "#10b981" : "#e5e7eb" }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Resumen del plan */}
      <div className="mb-5 rounded-2xl border border-border bg-muted/40 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">{flow.plan.packageName}</h2>
          <span className="whitespace-nowrap text-base font-bold text-foreground tabular-nums">
            {formatCurrency(flow.plan.total, flow.plan.currency)}
          </span>
        </div>
        {(eventDate || flow.plan.eventType) && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[flow.plan.eventType, eventDate].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* PASO ACTUAL */}
      {flow.currentStep === "form" && pendingForm && (
        <StepCard
          icon={<FileText className="h-5 w-5" />}
          color={color}
          title="Completa tu cuestionario"
          description="Necesitamos algunos datos para preparar tu sesión."
          ctaLabel="Continuar al cuestionario"
          ctaHref={`/f/${pendingForm.accessToken}?return=${encodeURIComponent(selfUrl)}`}
        />
      )}

      {flow.currentStep === "sign" && (
        <StepCard
          icon={<PenLine className="h-5 w-5" />}
          color={color}
          title="Revisa y firma tu contrato"
          description="Lee tu contrato de servicios y fírmalo digitalmente."
          ctaLabel="Revisar y firmar"
          ctaHref={`/sign/${flow.signingToken}?return=${encodeURIComponent(selfUrl)}`}
        />
      )}

      {flow.currentStep === "pay" && (
        <BookingPaymentStep
          token={flow.signingToken}
          color={color}
          currency={flow.plan.currency}
          total={flow.plan.total}
          depositAmount={flow.plan.depositAmount}
          depositPercent={flow.plan.depositPercent}
          paymentInstructions={flow.studio.paymentInstructions}
          paymentWhatsapp={flow.studio.paymentWhatsapp}
          clientName={flow.client.name}
        />
      )}

      {flow.currentStep === "done" && (
        <DoneView
          paid={flow.invoice?.status === "paid"}
          notified={flow.paymentNotified}
          invoiceId={flow.invoice?.id ?? null}
          color={color}
        />
      )}
    </Shell>
  )
}

function StepCard({
  icon,
  color,
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  icon: React.ReactNode
  color: string
  title: string
  description: string
  ctaLabel: string
  ctaHref: string
}) {
  return (
    <div className="rounded-2xl border border-border-strong bg-card p-5 text-center">
      <div
        className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full text-white"
        style={{ background: color }}
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>
      <a
        href={ctaHref}
        className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: color }}
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  )
}

function DoneView({
  paid,
  notified,
  invoiceId,
  color,
}: {
  paid: boolean
  notified: boolean
  invoiceId: string | null
  color: string
}) {
  if (paid) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:bg-emerald-500/10">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground">¡Sesión confirmada y agendada! 🎉</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Recibimos tu pago. Te contactaremos con los detalles finales.
        </p>
        {invoiceId && (
          <a
            href={`/i/${invoiceId}`}
            className="mt-4 inline-block text-sm font-medium hover:underline"
            style={{ color }}
          >
            Ver mi factura
          </a>
        )}
      </div>
    )
  }
  // notified (o sin pago aún): esperando confirmación del studio
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:bg-amber-500/10">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-400 text-white">
        <Clock className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-bold text-foreground">¡Gracias! Recibimos tu aviso de pago</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {notified
          ? "Tu sesión quedará confirmada en cuanto el estudio verifique el pago. Te avisaremos."
          : "Estamos procesando tu reserva."}
      </p>
      {invoiceId && (
        <a
          href={`/i/${invoiceId}`}
          className="mt-4 inline-block text-sm font-medium hover:underline"
          style={{ color }}
        >
          Ver mi factura
        </a>
      )}
    </div>
  )
}

function Shell({
  children,
  studioName,
  color,
  logoUrl,
}: {
  children: React.ReactNode
  studioName: string
  color: string
  logoUrl?: string | null
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-4 flex items-center justify-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={studioName} className="h-8 w-auto" />
          ) : (
            <span className="text-sm font-semibold" style={{ color }}>
              {studioName}
            </span>
          )}
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
