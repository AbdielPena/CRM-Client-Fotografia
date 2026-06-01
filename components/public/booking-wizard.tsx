"use client"

import { useRef, useState } from "react"
import {
  Check,
  ArrowRight,
  Loader2,
  Sparkles,
  Landmark,
  MessageCircle,
  CheckCircle2,
  Clock,
} from "lucide-react"

import { SignaturePad, type SignaturePadHandle } from "@/components/public/signature-pad"
import { notifyPaymentIntentAction } from "@/server/actions/booking-flow.actions"
import type { FormField, FormSchema } from "@/lib/forms/types"

type StepKey = "plan" | "form" | "contract" | "pay" | "done"

interface BookingWizardProps {
  token: string
  studio: { name: string; logoUrl: string | null; color: string }
  client: { name: string }
  plan: {
    packageName: string
    eventType: string | null
    eventDate: string | null
    location: string | null
    total: number
    currency: string
    includes: string[]
    depositPercent: number
    depositAmount: number
  }
  steps: StepKey[]
  pendingForm: { accessToken: string; schema: FormSchema; data: Record<string, unknown> } | null
  contractHtml: string | null
  payment: {
    instructions: string | null
    whatsapp: string | null
    invoiceId: string | null
  }
  /** Estado final si ya completó todo (pago notificado/pagado). */
  finalState: "paid" | "notified" | null
}

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(d: string | null) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" })
  } catch {
    return d
  }
}

export function BookingWizard(props: BookingWizardProps) {
  const { color } = props.studio
  const [idx, setIdx] = useState(0)
  const step = props.steps[idx] ?? "done"
  const advance = () => setIdx((i) => Math.min(i + 1, props.steps.length - 1))

  // ── Estado del formulario ──
  const [formData, setFormData] = useState<Record<string, unknown>>(
    props.pendingForm?.data ?? {},
  )
  const [formErr, setFormErr] = useState<string | null>(null)

  // ── Estado del contrato ──
  const padRef = useRef<SignaturePadHandle | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [signerName, setSignerName] = useState(props.client.name)
  const [contractErr, setContractErr] = useState<string | null>(null)

  // ── Estado del pago ──
  const [payMsg, setPayMsg] = useState("")
  const [payErr, setPayErr] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)

  // visibilidad de los stepper dots
  const dotSteps = props.steps.filter((s) => s !== "plan" && s !== "done")
  const dotIndex = dotSteps.indexOf(step as StepKey)

  const eventDate = fmtDate(props.plan.eventDate)
  const firstName = props.client.name.split(" ")[0] || "Hola"

  // ── Handlers ──
  async function submitForm() {
    if (!props.pendingForm) return advance()
    setFormErr(null)
    // Validación mínima de requeridos visibles
    for (const f of props.pendingForm.schema.fields ?? []) {
      if (f.visibleIf) {
        const src = String(formData[f.visibleIf.key] ?? "")
        if (src !== f.visibleIf.equals) continue
      }
      if (f.required) {
        const v = formData[f.key]
        if (v === undefined || v === null || String(v).trim() === "") {
          setFormErr(`Completa: ${f.label}`)
          return
        }
      }
    }
    setBusy(true)
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: props.pendingForm.accessToken, data: formData }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormErr(b.error ?? "No pudimos enviar el formulario")
        return
      }
      advance()
    } catch {
      setFormErr("Error de conexión")
    } finally {
      setBusy(false)
    }
  }

  async function submitContract() {
    setContractErr(null)
    if (!agreed) return setContractErr("Debes aceptar los términos antes de firmar")
    if (!signerName.trim()) return setContractErr("Escribe tu nombre completo")
    const dataUrl = padRef.current?.getDataUrl() ?? null
    if (!dataUrl) return setContractErr("Firma en el cuadro antes de continuar")
    setBusy(true)
    try {
      const res = await fetch("/api/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: props.token,
          signerName: signerName.trim(),
          signatureImageDataUrl: dataUrl,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setContractErr(b.error ?? "No pudimos registrar la firma")
        return
      }
      advance()
    } catch {
      setContractErr("Error de conexión")
    } finally {
      setBusy(false)
    }
  }

  async function submitPayment() {
    setPayErr(null)
    setBusy(true)
    try {
      const res = await notifyPaymentIntentAction({
        token: props.token,
        amount: props.plan.depositAmount,
        message: payMsg.trim() || undefined,
      })
      if (!res.ok) {
        setPayErr(res.message)
        return
      }
      advance()
    } catch {
      setPayErr("Error de conexión")
    } finally {
      setBusy(false)
    }
  }

  const waNumber = props.payment.whatsapp?.replace(/\D/g, "") ?? ""
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hola, soy ${props.client.name}. Adjunto el comprobante de mi reserva (${money(props.plan.depositAmount, props.plan.currency)}).`)}`
    : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-4 flex items-center justify-center">
          {props.studio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.studio.logoUrl} alt={props.studio.name} className="h-8 w-auto" />
          ) : (
            <span className="text-sm font-semibold" style={{ color }}>
              {props.studio.name}
            </span>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {/* Stepper */}
          {step !== "plan" && step !== "done" && dotSteps.length > 0 && (
            <div className="mb-5 flex items-center justify-center gap-2">
              {dotSteps.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: i < dotIndex ? "#10b981" : i === dotIndex ? color : "#d1d5db" }}
                  >
                    {i < dotIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  {i < dotSteps.length - 1 && (
                    <div className="h-0.5 w-6" style={{ background: i < dotIndex ? "#10b981" : "#e5e7eb" }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ───────── PASO 1: PLAN ───────── */}
          {step === "plan" && (
            <div>
              <div className="mb-5 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${color}1a` }}>
                  <Sparkles className="h-6 w-6" style={{ color }} />
                </div>
                <h1 className="text-2xl font-bold text-foreground">¡Hola, {firstName}!</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tu solicitud fue aprobada. Esto fue lo que seleccionaste:
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-bold text-foreground">{props.plan.packageName}</h2>
                  <span className="whitespace-nowrap text-lg font-bold tabular-nums text-foreground">
                    {money(props.plan.total, props.plan.currency)}
                  </span>
                </div>
                <dl className="mt-4 space-y-2.5 border-t border-border/60 pt-4 text-sm">
                  {props.plan.eventType && <Row k="Tipo de sesión" v={props.plan.eventType} />}
                  {eventDate && <Row k="Fecha" v={eventDate} />}
                  {props.plan.location && <Row k="Ubicación" v={props.plan.location} />}
                  <Row k="Reserva para confirmar" v={`${money(props.plan.depositAmount, props.plan.currency)} (${props.plan.depositPercent}%)`} />
                </dl>
                {props.plan.includes.length > 0 && (
                  <div className="mt-4 border-t border-border/60 pt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Incluye</p>
                    <ul className="space-y-1.5">
                      {props.plan.includes.map((inc, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                          {inc}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <PrimaryBtn color={color} onClick={advance}>
                Continuar <ArrowRight className="h-4 w-4" />
              </PrimaryBtn>
            </div>
          )}

          {/* ───────── PASO 2: CUESTIONARIO ───────── */}
          {step === "form" && props.pendingForm && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-foreground">
                {props.pendingForm.schema.title ?? "Cuestionario"}
              </h2>
              {props.pendingForm.schema.description && (
                <p className="mb-4 text-sm text-muted-foreground">{props.pendingForm.schema.description}</p>
              )}
              <div className="space-y-4">
                {(props.pendingForm.schema.fields ?? []).map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={formData[f.key]}
                    data={formData}
                    color={color}
                    onChange={(v) => setFormData((prev) => ({ ...prev, [f.key]: v }))}
                  />
                ))}
              </div>
              {formErr && <ErrBox>{formErr}</ErrBox>}
              <PrimaryBtn color={color} onClick={submitForm} busy={busy}>
                Continuar <ArrowRight className="h-4 w-4" />
              </PrimaryBtn>
            </div>
          )}

          {/* ───────── PASO 3: CONTRATO ───────── */}
          {step === "contract" && (
            <div>
              <h2 className="mb-3 text-lg font-bold text-foreground">Contrato de servicios</h2>
              <div
                className="mb-4 max-h-72 overflow-y-auto rounded-xl border border-border bg-background p-4 text-sm leading-relaxed text-foreground [&_h1]:text-base [&_h1]:font-bold [&_h2]:font-semibold"
                dangerouslySetInnerHTML={{ __html: props.contractHtml ?? "<p>Contrato no disponible.</p>" }}
              />
              <label className="mb-1 block text-sm font-medium text-foreground">Tu nombre completo</label>
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ outlineColor: color }}
              />
              <label className="mb-1 block text-sm font-medium text-foreground">Firma</label>
              <div className="mb-3 rounded-xl border border-border bg-background">
                <SignaturePad ref={padRef} />
              </div>
              <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                He leído y acepto los términos del contrato.
              </label>
              {contractErr && <ErrBox>{contractErr}</ErrBox>}
              <PrimaryBtn color={color} onClick={submitContract} busy={busy}>
                Firmar y continuar <ArrowRight className="h-4 w-4" />
              </PrimaryBtn>
            </div>
          )}

          {/* ───────── PASO 4: PAGO ───────── */}
          {step === "pay" && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-foreground">¿Cómo pagar tu reserva?</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Para confirmar tu sesión, realiza el pago de la reserva ({props.plan.depositPercent}%).
              </p>
              <div className="mb-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total de la sesión</span>
                  <span className="font-medium tabular-nums text-foreground">{money(props.plan.total, props.plan.currency)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">A pagar hoy</span>
                  <span className="text-lg font-bold tabular-nums" style={{ color }}>
                    {money(props.plan.depositAmount, props.plan.currency)}
                  </span>
                </div>
              </div>
              <div className="mb-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Landmark className="h-3.5 w-3.5" /> Transferencia bancaria
                </div>
                {props.payment.instructions ? (
                  <pre className="whitespace-pre-wrap rounded-xl border border-border bg-background p-3 font-sans text-sm text-foreground">
                    {props.payment.instructions}
                  </pre>
                ) : (
                  <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
                    El estudio te compartirá los datos de pago.
                  </p>
                )}
              </div>
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
                  <MessageCircle className="h-4 w-4" /> Enviar comprobante por WhatsApp
                </a>
              )}
              <textarea
                value={payMsg}
                onChange={(e) => setPayMsg(e.target.value)}
                rows={2}
                placeholder="Mensaje para el estudio (opcional): ya hice la transferencia, te envío el voucher."
                className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
              {payErr && <ErrBox>{payErr}</ErrBox>}
              <PrimaryBtn color={color} onClick={submitPayment} busy={busy}>
                <CheckCircle2 className="h-4 w-4" /> Notificar pago y reservar
              </PrimaryBtn>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Tu sesión se confirma cuando el estudio verifique el pago.
              </p>
            </div>
          )}

          {/* ───────── DONE ───────── */}
          {step === "done" && (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: props.finalState === "paid" ? "#10b981" : "#f59e0b" }}>
                {props.finalState === "paid" ? <Check className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
              </div>
              <h2 className="text-lg font-bold text-foreground">
                {props.finalState === "paid" ? "¡Sesión confirmada! 🎉" : "¡Gracias! Recibimos tu aviso de pago"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {props.finalState === "paid"
                  ? "Recibimos tu pago. Te contactaremos con los detalles finales."
                  : "Tu sesión quedará confirmada cuando el estudio verifique el pago. Te avisaremos."}
              </p>
              {props.payment.invoiceId && (
                <a href={`/i/${props.payment.invoiceId}`} className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color }}>
                  Ver mi factura
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium text-foreground">{v}</dd>
    </div>
  )
}

function ErrBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {children}
    </p>
  )
}

function PrimaryBtn({
  color,
  onClick,
  busy,
  children,
}: {
  color: string
  onClick: () => void
  busy?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: color }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  )
}

function FieldInput({
  field,
  value,
  data,
  color,
  onChange,
}: {
  field: FormField
  value: unknown
  data: Record<string, unknown>
  color: string
  onChange: (v: unknown) => void
}) {
  // Condicional
  if (field.visibleIf) {
    const src = String(data[field.visibleIf.key] ?? "")
    if (src !== field.visibleIf.equals) return null
  }
  const base =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2"
  const label = (
    <label className="mb-1 block text-sm font-medium text-foreground">
      {field.label}
      {field.required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  )

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          rows={3}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      </div>
    )
  }
  if (field.type === "select") {
    return (
      <div>
        {label}
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Selecciona…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    )
  }
  if (field.type === "radio") {
    return (
      <div>
        {label}
        <div className="space-y-1.5">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input type="radio" name={field.key} checked={value === o.value} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
        {field.label}
      </label>
    )
  }
  const inputType =
    field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"
  return (
    <div>
      {label}
      <input
        type={inputType}
        value={String(value ?? "")}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={base}
      />
    </div>
  )
}
