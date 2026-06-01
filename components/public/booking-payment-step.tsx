"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Landmark, MessageCircle, Loader2, CheckCircle2 } from "lucide-react"

import { notifyPaymentIntentAction } from "@/server/actions/booking-flow.actions"

interface BookingPaymentStepProps {
  token: string
  color: string
  currency: string
  total: number
  depositAmount: number
  depositPercent: number
  paymentInstructions: string | null
  paymentWhatsapp: string | null
  clientName: string
}

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function BookingPaymentStep({
  token,
  color,
  currency,
  total,
  depositAmount,
  depositPercent,
  paymentInstructions,
  paymentWhatsapp,
  clientName,
}: BookingPaymentStepProps) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const remaining = Math.max(0, total - depositAmount)
  const waNumber = paymentWhatsapp?.replace(/\D/g, "") ?? ""
  const waMsg = `Hola, soy ${clientName}. Adjunto el comprobante de mi pago de reserva (${money(depositAmount, currency)}).`
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`
    : null

  function handleNotify() {
    setError(null)
    startTransition(async () => {
      const res = await notifyPaymentIntentAction({
        token,
        amount: depositAmount,
        message: message.trim() || undefined,
      })
      if (res.ok) {
        router.refresh() // el wizard avanzará a "thanks" (paymentNotified=true)
      } else {
        setError(res.message)
      }
    })
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-foreground">¿Cómo pagar tu reserva?</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Para confirmar tu sesión, realiza el pago de la reserva
        ({depositPercent}%). El resto queda pendiente para más adelante.
      </p>

      {/* Montos */}
      <div className="mb-4 rounded-2xl border border-border bg-muted/40 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total de la sesión</span>
          <span className="font-medium text-foreground tabular-nums">{money(total, currency)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">A pagar hoy (reserva)</span>
          <span className="text-lg font-bold tabular-nums" style={{ color }}>
            {money(depositAmount, currency)}
          </span>
        </div>
        {remaining > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Restante {money(remaining, currency)} — se paga después.
          </p>
        )}
      </div>

      {/* Instrucciones de transferencia */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Landmark className="h-3.5 w-3.5" /> Transferencia bancaria
        </div>
        {paymentInstructions ? (
          <pre className="whitespace-pre-wrap rounded-xl border border-border bg-card p-3 font-sans text-sm text-foreground">
            {paymentInstructions}
          </pre>
        ) : (
          <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            El estudio te compartirá los datos de pago.
          </p>
        )}
      </div>

      {/* Enviar voucher por WhatsApp */}
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          <MessageCircle className="h-4 w-4" />
          Enviar comprobante por WhatsApp
        </a>
      )}

      {/* Mensaje opcional */}
      <label className="mb-1 block text-sm font-medium text-foreground">
        Mensaje para el estudio (opcional)
      </label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        placeholder="Ej. Ya realicé la transferencia, te envío el voucher por WhatsApp."
        className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        onClick={handleNotify}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: color }}
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" /> Notificar pago y reservar
          </>
        )}
      </button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Tu sesión quedará confirmada cuando el estudio verifique el pago.
      </p>
    </div>
  )
}
