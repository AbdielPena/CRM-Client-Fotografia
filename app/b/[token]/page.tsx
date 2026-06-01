import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Check, FileText, PenLine, CreditCard, Sparkles, Lock } from "lucide-react"

import { getClientBookingFlow } from "@/server/services/booking-flow.service"
import { formatCurrency } from "@/lib/utils/currency"

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

  if (flow.expired) {
    return (
      <Shell studioName={flow.studio.name} color={flow.studio.primaryColor}>
        <div className="text-center">
          <h1 className="mb-2 text-xl font-bold">Este enlace ya no está disponible</h1>
          <p className="text-sm text-muted-foreground">
            Tu enlace de confirmación expiró o fue anulado. Contacta a tu
            fotógrafo para recibir uno nuevo.
          </p>
        </div>
      </Shell>
    )
  }

  const eventDate = formatDate(flow.plan.eventDate)
  const firstName = flow.client.name.split(" ")[0] || "Hola"

  // Estado de cada paso
  const formDone = flow.formsPending === 0
  const signDone = flow.contractSigned
  const payDone = flow.invoice?.status === "paid"
  const allDone = flow.currentStep === "done"

  // El formulario al que mandamos (primero pendiente)
  const pendingForm = flow.forms.find(
    (f) => f.status !== "completed" && f.status !== "expired",
  )

  return (
    <Shell studioName={flow.studio.name} color={flow.studio.primaryColor} logoUrl={flow.studio.logoUrl}>
      {/* Bienvenida */}
      <div className="mb-6 text-center">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: `${flow.studio.primaryColor}1a` }}
        >
          <Sparkles className="h-6 w-6" style={{ color: flow.studio.primaryColor }} />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {allDone ? "¡Todo listo!" : `¡Hola, ${firstName}!`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {allDone
            ? "Tu sesión está confirmada. Te esperamos."
            : "Tu solicitud fue aprobada. Sigue estos pasos para confirmar tu sesión."}
        </p>
      </div>

      {/* Resumen del plan */}
      <div className="mb-6 rounded-2xl border border-border bg-muted/40 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tu plan
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">{flow.plan.packageName}</h2>
          <span className="whitespace-nowrap text-lg font-bold text-foreground tabular-nums">
            {formatCurrency(flow.plan.total, flow.plan.currency)}
          </span>
        </div>
        {(eventDate || flow.plan.eventType) && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[flow.plan.eventType, eventDate].filter(Boolean).join(" · ")}
          </p>
        )}
        {flow.plan.includes.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
            {flow.plan.includes.map((inc, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                {inc}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Checklist de pasos */}
      <div className="space-y-3">
        <StepRow
          n={1}
          icon={<Check className="h-4 w-4" />}
          title="Solicitud aprobada"
          state="done"
          color={flow.studio.primaryColor}
        />

        {flow.forms.length > 0 && (
          <StepRow
            n={2}
            icon={<FileText className="h-4 w-4" />}
            title="Completa tu formulario"
            description={
              formDone
                ? "Recibimos tus respuestas."
                : "Necesitamos algunos datos para tu sesión."
            }
            state={formDone ? "done" : "active"}
            color={flow.studio.primaryColor}
            cta={
              !formDone && pendingForm
                ? { href: `/f/${pendingForm.accessToken}`, label: "Completar formulario" }
                : undefined
            }
          />
        )}

        <StepRow
          n={flow.forms.length > 0 ? 3 : 2}
          icon={<PenLine className="h-4 w-4" />}
          title="Firma el contrato"
          description={
            signDone
              ? "Contrato firmado. ¡Gracias!"
              : formDone
                ? "Revisa y firma tu contrato digital."
                : "Completa el formulario primero."
          }
          state={signDone ? "done" : formDone ? "active" : "locked"}
          color={flow.studio.primaryColor}
          cta={
            !signDone && formDone
              ? { href: `/sign/${flow.signingToken}`, label: "Revisar y firmar" }
              : undefined
          }
        />

        <StepRow
          n={flow.forms.length > 0 ? 4 : 3}
          icon={<CreditCard className="h-4 w-4" />}
          title="Realiza el pago"
          description={
            payDone
              ? "Pago recibido. Sesión confirmada."
              : signDone && flow.invoice
                ? "Revisa tu factura y realiza el pago para confirmar."
                : "Disponible después de firmar el contrato."
          }
          state={payDone ? "done" : signDone && flow.invoice ? "active" : "locked"}
          color={flow.studio.primaryColor}
          cta={
            !payDone && signDone && flow.invoice
              ? { href: `/i/${flow.invoice.id}`, label: "Ver factura y pagar" }
              : undefined
          }
        />
      </div>

      {flow.currentStep === "pay" && flow.invoice && (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Tu sesión quedará <strong>confirmada</strong> cuando recibamos el pago.
        </p>
      )}
    </Shell>
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

function StepRow({
  n,
  icon,
  title,
  description,
  state,
  color,
  cta,
}: {
  n: number
  icon: React.ReactNode
  title: string
  description?: string
  state: "done" | "active" | "locked"
  color: string
  cta?: { href: string; label: string }
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 ${
        state === "active"
          ? "border-border-strong bg-card"
          : "border-border/60 bg-muted/20"
      }`}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white"
        style={{
          background:
            state === "done" ? "#10b981" : state === "active" ? color : "#9ca3af",
        }}
      >
        {state === "done" ? (
          <Check className="h-4 w-4" />
        ) : state === "locked" ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          icon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold ${
            state === "locked" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
        {cta && (
          <a
            href={cta.href}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: color }}
          >
            {cta.label}
          </a>
        )}
      </div>
    </div>
  )
}
