"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Shirt, UploadCloud, Loader2, ImageIcon, Check, Receipt } from "lucide-react"
import { toast } from "sonner"

import {
  saveSessionDressAction,
  markSessionDressPaidAction,
  addDressExtraToInvoiceAction,
} from "@/server/actions/project.actions"
import { cn } from "@/lib/utils/cn"

/**
 * Vestido de la sesión (planes que incluyen el vestido). Manual: foto + nombre +
 * proveedor + costo. El costo (hasta el monto incluido) se resta de la ganancia
 * neta y se registra como gasto en Finanzas (FinanzApp). Si excede lo incluido,
 * el excedente se puede agregar a la factura del cliente (con confirmación).
 */
export function SessionDressCard({
  projectId,
  dressName,
  dressProvider,
  dressCost,
  dressNotes,
  dressImageUrl,
  dressPayStatus,
  dressExtra,
  dressExtraInvoiced,
  currency,
}: {
  projectId: string
  dressName: string | null
  dressProvider: string | null
  dressCost: number | null
  dressNotes: string | null
  dressImageUrl: string | null
  dressPayStatus: string | null
  dressExtra: number
  dressExtraInvoiced: boolean
  currency: string
}) {
  const router = useRouter()
  const [name, setName] = useState(dressName ?? "")
  const [provider, setProvider] = useState(dressProvider ?? "")
  const [cost, setCost] = useState(dressCost != null ? String(dressCost) : "")
  const [notes, setNotes] = useState(dressNotes ?? "")
  const [imageUrl, setImageUrl] = useState(dressImageUrl ?? "")
  const [extraAmount, setExtraAmount] = useState(dressExtra > 0 ? String(dressExtra) : "")
  const [busy, start] = useTransition()
  const [payBusy, startPay] = useTransition()
  const [extraBusy, startExtra] = useTransition()

  const paid = dressPayStatus === "paid"
  const hasCost = cost.trim() !== "" && Number(cost) > 0
  const fmt = (n: number) => `${currency} ${n.toLocaleString("es-DO")}`

  const save = () =>
    start(async () => {
      const r = await saveSessionDressAction(projectId, {
        dressCatalogId: null,
        dressName: name,
        dressProvider: provider,
        dressCost: cost,
        dressNotes: notes,
        dressImageUrl: imageUrl || null,
      })
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      toast.success("Vestido guardado")
      router.refresh()
    })

  const togglePaid = () =>
    startPay(async () => {
      const r = await markSessionDressPaidAction(projectId, !paid)
      if (!r.ok) {
        toast.error(r.error ?? "Error")
        return
      }
      toast.success(!paid ? "Gasto del vestido marcado como pagado" : "Marcado como pendiente")
      router.refresh()
    })

  const addExtra = () =>
    startExtra(async () => {
      const monto = Number(extraAmount)
      if (!(monto > 0)) {
        toast.error("Monto del costo extra inválido")
        return
      }
      const r = await addDressExtraToInvoiceAction(projectId, monto)
      if (!r.ok) {
        toast.error(r.error ?? "Error")
        return
      }
      toast.success("Costo extra agregado a la factura")
      router.refresh()
    })

  return (
    <div className="sf-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Shirt className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Vestido de la sesión</h2>
      </div>
      <div className="space-y-2.5">
        <DressPhotoField value={imageUrl} onChange={setImageUrl} />
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Nombre o código del vestido</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Modelo Aurora / código A-128"
            className="mt-0.5 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Proveedor / tienda</span>
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="Ej: JOP Eventos"
            className="mt-0.5 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            Costo total del vestido (lo incluido se resta de la ganancia; el resto se factura)
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className="mt-0.5 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Notas internas</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Visible solo para ti."
            className="mt-0.5 block w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
          />
        </label>
        <button
          onClick={save}
          disabled={busy}
          className={cn(
            "w-full rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity",
            busy && "opacity-60",
          )}
        >
          {busy ? "Guardando…" : "Guardar vestido"}
        </button>

        {hasCost && (
          <button
            onClick={togglePaid}
            disabled={payBusy}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
              paid
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-border text-foreground hover:bg-muted/50",
            )}
          >
            {paid ? (
              <>
                <Check className="h-3.5 w-3.5" /> Pagado (a la tienda) — marcar pendiente
              </>
            ) : (
              "Marcar gasto del vestido como pagado"
            )}
          </button>
        )}

        {dressExtra > 0 && !dressExtraInvoiced && (
          <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <Receipt className="h-3.5 w-3.5" /> Costo extra de vestido
            </p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              El vestido excede lo incluido en el plan por <b>{fmt(dressExtra)}</b>. Confirma el
              monto y agrégalo a la factura del cliente.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={extraAmount}
                onChange={(e) => setExtraAmount(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums text-foreground"
              />
              <button
                onClick={addExtra}
                disabled={extraBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {extraBusy ? "…" : "Agregar a la factura"}
              </button>
            </div>
          </div>
        )}
        {dressExtra > 0 && dressExtraInvoiced && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            ✓ Costo extra de vestido ({fmt(dressExtra)}) ya agregado a la factura.
          </p>
        )}
      </div>
    </div>
  )
}

function DressPhotoField({
  value,
  onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("variant", "dress")
      const res = await fetch("/api/studio/branding/logo", { method: "POST", body: fd })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || "Error al subir")
      onChange(json.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted/30">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Vestido" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Foto del vestido</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
          {value ? "Cambiar foto" : "Subir foto"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Quitar
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onPick}
      />
    </div>
  )
}
