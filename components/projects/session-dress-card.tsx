"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Shirt } from "lucide-react"
import { toast } from "sonner"

import { saveSessionDressAction } from "@/server/actions/project.actions"
import { cn } from "@/lib/utils/cn"

export type CatalogDress = {
  id: string
  name: string
  collection: string | null
  rentalPrice: number | null
}
export type CatalogStore = {
  storeId: string
  storeName: string
  dresses: CatalogDress[]
}

/**
 * Registro del vestido de la sesión (quinceañera). Se elige del catálogo
 * (agrupado por tienda; el costo se autocompleta del rental_price) o a mano.
 * El costo se descuenta en la "Ganancia neta".
 */
export function SessionDressCard({
  projectId,
  dressCatalogId,
  dressName,
  dressProvider,
  dressCost,
  dressNotes,
  catalog,
  currency,
}: {
  projectId: string
  dressCatalogId: string | null
  dressName: string | null
  dressProvider: string | null
  dressCost: number | null
  dressNotes: string | null
  catalog: CatalogStore[]
  currency: string
}) {
  const router = useRouter()
  const [catalogId, setCatalogId] = useState(dressCatalogId ?? "")
  const [name, setName] = useState(dressName ?? "")
  const [provider, setProvider] = useState(dressProvider ?? "")
  const [cost, setCost] = useState(dressCost != null ? String(dressCost) : "")
  const [notes, setNotes] = useState(dressNotes ?? "")
  const [busy, start] = useTransition()

  const hasCatalog = catalog.some((s) => s.dresses.length > 0)

  const onPick = (id: string) => {
    setCatalogId(id)
    if (!id) return
    for (const s of catalog) {
      const d = s.dresses.find((x) => x.id === id)
      if (d) {
        setName(d.collection ? `${d.name} — ${d.collection}` : d.name)
        setProvider(s.storeName)
        if (d.rentalPrice != null) setCost(String(d.rentalPrice))
        break
      }
    }
  }

  const save = () => {
    start(async () => {
      const r = await saveSessionDressAction(projectId, {
        dressCatalogId: catalogId || null,
        dressName: name,
        dressProvider: provider,
        dressCost: cost,
        dressNotes: notes,
      })
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      toast.success("Vestido guardado")
      router.refresh()
    })
  }

  return (
    <div className="sf-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Shirt className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Vestido seleccionado</h2>
      </div>
      <div className="space-y-2.5">
        {hasCatalog && (
          <label className="block">
            <span className="text-[11px] text-muted-foreground">Elegir del catálogo (por tienda)</span>
            <select
              value={catalogId}
              onChange={(e) => onPick(e.target.value)}
              className="mt-0.5 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
            >
              <option value="">— Sin catálogo / a mano —</option>
              {catalog
                .filter((s) => s.dresses.length > 0)
                .map((s) => (
                  <optgroup key={s.storeId} label={s.storeName}>
                    {s.dresses.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.collection ? `${d.name} — ${d.collection}` : d.name}
                        {d.rentalPrice != null ? ` · ${currency} ${d.rentalPrice.toLocaleString("es-DO")}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </label>
        )}
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
          <span className="text-[11px] text-muted-foreground">Proveedor / tienda (si aplica)</span>
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="Ej: Quinceañeras VIP RD"
            className="mt-0.5 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Costo del vestido</span>
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
      </div>
    </div>
  )
}
