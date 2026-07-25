"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Copy, Check, FileText, Send } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"
import { formatCurrency } from "@/lib/utils/currency"
import { createQuoteAction } from "@/server/actions/booking-quote.actions"

export type QuoteRow = {
  id: string
  clientName: string
  clientEmail: string
  eventDate: string
  amount: number
  packageName: string
  status: string
  sentAt: string | null
  acceptedAt: string | null
  url: string
}

export type PackageOption = {
  id: string
  name: string
  price: number
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
const labelCls = "mb-1 block text-xs font-medium text-foreground"

function estadoBadge(q: QuoteRow) {
  if (q.acceptedAt)
    return {
      label: "Aceptada",
      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    }
  if (q.status === "quoted")
    return {
      label: "Esperando al cliente",
      cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    }
  return {
    label: q.status,
    cls: "bg-muted text-muted-foreground",
  }
}

export function QuoteManager({
  quotes,
  packages,
  currency = "DOP",
}: {
  quotes: QuoteRow[]
  packages: PackageOption[]
  currency?: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState<string | null>(null)

  const copy = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(id)
      toast.success("Link copiado")
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  const esperando = quotes.filter((q) => !q.acceptedAt && q.status === "quoted")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {esperando.length > 0
              ? `${esperando.length} esperando respuesta del cliente`
              : "Sin cotizaciones pendientes"}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva cotización
        </button>
      </div>

      {quotes.length === 0 ? (
        <div className="sf-card py-12 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Aún no has registrado cotizaciones
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Cuando cierres un trato por WhatsApp, regístralo aquí: al cliente le
            llega un correo para completar sus datos y firmar el contrato, sin
            que tengas que hacerlo tú a mano.
          </p>
        </div>
      ) : (
        <div className="sf-card divide-y divide-border/60">
          {quotes.map((q) => {
            const b = estadoBadge(q)
            return (
              <div
                key={q.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {q.clientName}
                    </p>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        b.cls,
                      )}
                    >
                      {b.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {q.packageName} · {q.eventDate} · {q.clientEmail}
                  </p>
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {formatCurrency(q.amount, currency)}
                </div>
                {!q.acceptedAt && (
                  <button
                    onClick={() => copy(q.url, q.id)}
                    title="Copiar el link para mandarlo por WhatsApp"
                    className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {copied === q.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <QuoteModal
          packages={packages}
          currency={currency}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function QuoteModal({
  packages,
  currency,
  onClose,
  onSaved,
}: {
  packages: PackageOption[]
  currency: string
  onClose: () => void
  onSaved: () => void
}) {
  const [packageId, setPackageId] = React.useState(packages[0]?.id ?? "")
  const [amount, setAmount] = React.useState(
    packages[0] ? String(packages[0].price) : "",
  )
  const [saving, setSaving] = React.useState(false)

  const pkg = packages.find((p) => p.id === packageId)
  const listPrice = pkg?.price ?? 0
  const monto = Number(amount) || 0
  const diferencia = monto - listPrice

  // Al cambiar de plan, el precio sugerido es el de lista.
  const onPackageChange = (id: string) => {
    setPackageId(id)
    const p = packages.find((x) => x.id === id)
    if (p) setAmount(String(p.price))
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    try {
      const r = await createQuoteAction(fd)
      if (!r.ok) {
        toast.error(r.error)
        setSaving(false)
        return
      }
      toast.success("Cotización enviada", {
        description: r.emailed
          ? "Le llegó el correo con el link para completar sus datos"
          : "No se pudo enviar el correo — copia el link y mándalo tú",
      })
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-1 flex items-start justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Nueva cotización
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Se le envía por correo. Al completarlo, recibe el contrato para firmar
          — sin que tengas que aprobarlo otra vez.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className={labelCls}>Nombre del cliente *</label>
            <input name="clientName" className={inputCls} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Correo *</label>
              <input
                name="clientEmail"
                type="email"
                className={inputCls}
                placeholder="para enviarle la cotización"
                required
              />
            </div>
            <div>
              <label className={labelCls}>WhatsApp</label>
              <input name="clientPhone" className={inputCls} placeholder="809…" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Plan *</label>
            <select
              name="packageId"
              value={packageId}
              onChange={(e) => onPackageChange(e.target.value)}
              className={inputCls}
              required
            >
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatCurrency(p.price, currency)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fecha de la sesión *</label>
              <input name="eventDate" type="date" className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Precio acordado *</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
                required
              />
            </div>
          </div>

          {diferencia !== 0 && monto > 0 && (
            <p
              className={cn(
                "text-[11px]",
                diferencia < 0 ? "text-sky-600" : "text-amber-600",
              )}
            >
              {diferencia < 0
                ? `Le estás haciendo un descuento de ${formatCurrency(Math.abs(diferencia), currency)} sobre el precio de lista.`
                : `Está ${formatCurrency(diferencia, currency)} por encima del precio de lista.`}
            </p>
          )}

          <div>
            <label className={labelCls}>Nota para el cliente</label>
            <input
              name="note"
              className={inputCls}
              placeholder="Ej: incluye 2 vestidos y álbum digital"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {saving ? "Enviando…" : "Crear y enviar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
