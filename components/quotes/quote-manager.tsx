"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus,
  X,
  Copy,
  Check,
  FileText,
  Send,
  CalendarDays,
  ChevronRight,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"
import { formatCurrency, formatDate } from "@/lib/utils/currency"
import { createQuoteAction } from "@/server/actions/booking-quote.actions"
import {
  QuoteEventsEditor,
  eventosParaGuardar,
  nuevoEvento,
  type EventDraft,
  type PackageOption,
} from "./quote-events-editor"

export type { PackageOption }

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
  eventCount: number
  projectId: string | null
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
  if (q.status === "cancelled")
    return { label: "Anulada", cls: "bg-muted text-muted-foreground" }
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
                className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-muted/30"
              >
                {/* Abre el detalle: qué incluye, sus fechas y cómo gestionarla.
                    prefetch={false} — la lista se queda en blanco al navegar
                    si Next precarga estas rutas dinámicas. */}
                <Link
                  href={`/cotizaciones/${q.id}`}
                  prefetch={false}
                  className="min-w-0 flex-1"
                >
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
                    {q.eventCount > 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        <CalendarDays className="h-2.5 w-2.5" />
                        {q.eventCount} fechas
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {q.packageName}
                    {q.eventDate ? ` · ${formatDate(q.eventDate)}` : ""} ·{" "}
                    {q.clientEmail}
                  </p>
                </Link>
                <div className="text-sm font-semibold text-foreground">
                  {formatCurrency(q.amount, currency)}
                </div>
                {!q.acceptedAt && q.status === "quoted" && (
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
                <Link
                  href={`/cotizaciones/${q.id}`}
                  prefetch={false}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Abrir la cotización"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
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
  // Empieza con UNA fecha, con el primer plan puesto: para el trabajo de todos
  // los días esto se ve como el formulario de siempre.
  const [eventos, setEventos] = React.useState<EventDraft[]>([
    nuevoEvento(packages[0], true),
  ])
  const [items, setItems] = React.useState<
    Array<{ concept: string; qty: string; price: string }>
  >([{ concept: "", qty: "1", price: "" }])
  const [verExtras, setVerExtras] = React.useState(false)
  const [deliverables, setDeliverables] = React.useState<string[]>([""])
  const [amount, setAmount] = React.useState("")
  const [tocoElPrecio, setTocoElPrecio] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const setDeliv = (i: number, v: string) =>
    setDeliverables((p2) => p2.map((d, j) => (j === i ? v : d)))
  const addDeliv = () => setDeliverables((p2) => [...p2, ""])
  const removeDeliv = (i: number) =>
    setDeliverables((p2) => (p2.length === 1 ? p2 : p2.filter((_, j) => j !== i)))

  const itemsTotal = items.reduce(
    (t, i) => t + (Number(i.qty) || 1) * (Number(i.price) || 0),
    0,
  )
  const eventosTotal = eventos.reduce((t, e) => t + (Number(e.amount) || 0), 0)
  const sugerido = eventosTotal + itemsTotal

  // El precio acordado se va llenando solo con lo que suman las fechas y las
  // líneas extra, hasta que él lo escriba a mano: ahí manda lo que él puso.
  React.useEffect(() => {
    if (!tocoElPrecio) setAmount(sugerido > 0 ? String(sugerido) : "")
  }, [sugerido, tocoElPrecio])

  const setItem = (i: number, k: "concept" | "qty" | "price", v: string) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, [k]: v } : it)))
  const addItem = () =>
    setItems((prev) => [...prev, { concept: "", qty: "1", price: "" }])
  const removeItem = (i: number) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)))

  const monto = Number(amount) || 0
  const diferencia = monto - sugerido

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const listos = eventosParaGuardar(eventos)
    if (listos.length === 0) {
      toast.error("Ponle fecha por lo menos a un evento")
      return
    }
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    fd.set("events", JSON.stringify(listos))

    // La fecha y el plan del evento PRINCIPAL son los de la cotización: es lo
    // que ya leen la conversión a sesión, la factura y el contrato.
    const ppal = listos.find((x) => x.isPrimary) ?? listos[0]!
    fd.set("eventDate", ppal.eventDate)
    if (ppal.packageId) fd.set("packageId", ppal.packageId)
    else fd.delete("packageId")

    fd.set(
      "items",
      JSON.stringify(
        items
          .map((i) => ({
            concept: i.concept.trim(),
            qty: Number(i.qty) || 1,
            price: Number(i.price) || 0,
          }))
          .filter((i) => i.concept !== "" || i.price > 0),
      ),
    )
    fd.set(
      "deliverables",
      JSON.stringify(deliverables.map((d) => d.trim()).filter((d) => d !== "")),
    )
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
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
            <label className={labelCls}>¿Qué estás cotizando?</label>
            <input
              name="title"
              className={inputCls}
              placeholder="Ej: Quinceañera de Sofía — sesión y fiesta"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Es el nombre que verá el cliente y con el que nace la sesión. Si lo
              dejas vacío, se usa el del plan.
            </p>
          </div>

          {/* Las fechas del trabajo, cada una con lo suyo. */}
          <QuoteEventsEditor
            eventos={eventos}
            setEventos={setEventos}
            packages={packages}
            currency={currency}
          />

          {/* Cosas que no son un evento: un vestido extra, el traslado… */}
          <div className="rounded-lg border border-border/60 p-3">
            <button
              type="button"
              onClick={() => setVerExtras((v) => !v)}
              className="text-xs font-medium text-primary hover:opacity-80"
            >
              {verExtras ? "− " : "+ "}
              Otras líneas del presupuesto
              {itemsTotal > 0 && !verExtras
                ? ` (${formatCurrency(itemsTotal, currency)})`
                : ""}
            </button>
            {verExtras && (
              <div className="mt-3 space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={it.concept}
                      onChange={(e) => setItem(i, "concept", e.target.value)}
                      placeholder="Concepto"
                      className={cn(inputCls, "flex-1")}
                    />
                    <input
                      value={it.qty}
                      onChange={(e) => setItem(i, "qty", e.target.value)}
                      type="number"
                      min="1"
                      className={cn(inputCls, "w-14 text-center")}
                      title="Cantidad"
                    />
                    <input
                      value={it.price}
                      onChange={(e) => setItem(i, "price", e.target.value)}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className={cn(inputCls, "w-28")}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="rounded-md px-2 text-muted-foreground hover:bg-muted"
                      title="Quitar línea"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addItem}
                  className="text-xs font-medium text-primary hover:opacity-80"
                >
                  + Agregar línea
                </button>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Precio acordado *</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="1"
              value={amount}
              onChange={(e) => {
                setTocoElPrecio(true)
                setAmount(e.target.value)
              }}
              className={inputCls}
              required
            />
            {diferencia !== 0 && monto > 0 && sugerido > 0 && (
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  diferencia < 0 ? "text-sky-600" : "text-amber-600",
                )}
              >
                {diferencia < 0
                  ? `Le estás haciendo un descuento de ${formatCurrency(Math.abs(diferencia), currency)} sobre lo que suma el desglose.`
                  : `Está ${formatCurrency(diferencia, currency)} por encima de lo que suma el desglose.`}
              </p>
            )}
          </div>

          {/* Qué recibe el cliente. Texto libre: cada estudio y cada trabajo
              incluyen cosas distintas. */}
          <div>
            <label className={labelCls}>Qué incluye (entregables)</label>
            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={d}
                    onChange={(e) => setDeliv(i, e.target.value)}
                    onPaste={(e) => {
                      // Pegar un bloque de varias líneas crea una línea por
                      // cada una, en vez de aplastarlo todo en un renglón.
                      const txt = e.clipboardData.getData("text")
                      if (!txt.includes("\n")) return
                      e.preventDefault()
                      const partes = txt
                        .split(/\r?\n/)
                        .map((t) => t.trim())
                        .filter(Boolean)
                      setDeliverables((prev) => [
                        ...prev.slice(0, i),
                        ...partes,
                        ...prev.slice(i + 1),
                      ])
                    }}
                    className={inputCls}
                    placeholder={
                      i === 0
                        ? "Ej: 200 fotos digitales editadas en alta resolución"
                        : i === 1
                          ? "Ej: Entrega final a los 21 días de la selección"
                          : "Ej: Álbum 30x30 de 20 páginas"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeDeliv(i)}
                    className="rounded-md px-2 text-muted-foreground hover:bg-muted"
                    title="Quitar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addDeliv}
              className="mt-2 text-xs font-medium text-primary hover:opacity-80"
            >
              + Agregar entregable
            </button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Lo que no cabe arriba: enmarcado, traslado, vestidos… Lo que
              escribas aquí lo ve el cliente y queda guardado en la sesión.
            </p>
          </div>

          <div>
            <label className={labelCls}>Nota para el cliente</label>
            <textarea
              name="note"
              rows={6}
              className={inputCls}
              placeholder={"Puedes pegar aquí tu mensaje de WhatsApp tal cual. Los saltos de línea se respetan."}
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
