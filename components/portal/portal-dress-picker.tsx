"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Shirt } from "lucide-react"
import { toast } from "sonner"

import { selectSessionDressAction } from "@/server/actions/portal-dress.actions"

type Dress = { id: string; name: string; collection: string | null; imageUrl: string | null }
type Store = { storeId: string; storeName: string; dresses: Dress[] }

/**
 * El cliente elige su vestido desde el portal. Muestra foto + nombre + tienda,
 * SIN precio (es privado del estudio). Al elegir, queda registrado en el CRM.
 */
export function PortalDressPicker({
  projectId,
  stores,
  currentDressId,
  currentDressName,
}: {
  projectId: string
  stores: Store[]
  currentDressId: string | null
  currentDressName: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(currentDressId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, start] = useTransition()

  const pick = (id: string) => {
    if (busyId) return
    setBusyId(id)
    start(async () => {
      const r = await selectSessionDressAction(projectId, id)
      setBusyId(null)
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      setSelected(id)
      toast.success("¡Vestido seleccionado! 💛")
      router.refresh()
    })
  }

  const visible = stores.filter((s) => s.dresses.length > 0)
  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Pronto verás aquí los vestidos disponibles.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {currentDressName && (
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          Tu vestido elegido: <strong>{currentDressName}</strong>. Puedes cambiarlo cuando quieras.
        </div>
      )}
      {visible.map((s) => (
        <div key={s.storeId}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {s.storeName}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {s.dresses.map((d) => {
              const isSel = selected === d.id
              return (
                <button
                  key={d.id}
                  onClick={() => pick(d.id)}
                  disabled={!!busyId}
                  className={`group relative overflow-hidden rounded-2xl border text-left transition-all disabled:opacity-70 ${
                    isSel
                      ? "border-gold-500 ring-2 ring-gold-300"
                      : "border-border hover:border-gold-300"
                  }`}
                >
                  <div className="aspect-[3/4] w-full bg-muted">
                    {d.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.imageUrl}
                        alt={d.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Shirt className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  {isSel && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 text-white shadow">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className="p-2">
                    <p className="truncate text-[12.5px] font-medium text-foreground">{d.name}</p>
                    {d.collection && (
                      <p className="truncate text-[11px] text-muted-foreground">{d.collection}</p>
                    )}
                  </div>
                  {busyId === d.id && (
                    <div className="absolute inset-0 grid place-items-center bg-white/60 text-[11px] font-medium text-foreground">
                      Guardando…
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
