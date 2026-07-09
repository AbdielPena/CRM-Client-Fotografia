"use client"

import { useMemo, useState, useTransition } from "react"
import { Check, Loader2, Printer, Send, AlertCircle } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"
import type { GalleryPrintState } from "@/server/services/print-selection.service"

interface AssetLite {
  id: string
  thumbUrl: string | null
}

export function PrintSelectionPanel({
  token,
  assets,
  initialState,
  clientEmail,
  clientName,
}: {
  token: string
  assets: AssetLite[]
  initialState: GalleryPrintState
  clientEmail?: string | null
  clientName?: string | null
}) {
  const [state, setState] = useState<GalleryPrintState>(initialState)

  // Los tamaños en modo "auto" NO se seleccionan: se imprimen todas las
  // entregadas. Solo mostramos selección para las categorías manuales.
  const selectableCats = state.categories.filter((c) => c.mode !== "auto")
  const autoCats = state.categories.filter((c) => c.mode === "auto")

  const [activeKey, setActiveKey] = useState<string>(selectableCats[0]?.key ?? "")
  const [busyAsset, setBusyAsset] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const activeCat =
    selectableCats.find((c) => c.key === activeKey) ?? selectableCats[0]
  const selectedInActive = useMemo(
    () => new Set(activeCat?.assetIds ?? []),
    [activeCat],
  )

  const thumbById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const a of assets) m.set(a.id, a.thumbUrl)
    return m
  }, [assets])

  const allComplete = selectableCats.every((c) => c.used >= c.allowed)

  async function call(body: Record<string, unknown>) {
    const res = await fetch(`/api/galleries/public/${token}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      state?: GalleryPrintState
      error?: string
    }
    if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo guardar")
    if (data.state) setState(data.state)
  }

  function toggle(assetId: string) {
    if (!activeCat || state.locked) return
    const isSelected = selectedInActive.has(assetId)
    if (!isSelected && activeCat.used >= activeCat.allowed) {
      toast.error(`Límite alcanzado · ${activeCat.label} (${activeCat.allowed})`)
      return
    }
    setBusyAsset(assetId)
    startTransition(async () => {
      try {
        await call({
          action: isSelected ? "remove" : "add",
          assetId,
          type: activeCat.type,
          spec: activeCat.spec,
          clientEmail: clientEmail || "",
          clientName: clientName || "",
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      } finally {
        setBusyAsset(null)
      }
    })
  }

  function submit() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/galleries/public/${token}/print/submit`, {
          method: "POST",
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          state?: GalleryPrintState
          error?: string
        }
        if (!res.ok || data.error) throw new Error(data.error ?? "Error")
        if (data.state) setState(data.state)
        toast.success("¡Selección de impresión enviada!")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  if (!state.enabled || state.categories.length === 0) return null

  const hasSelectable = selectableCats.length > 0

  return (
    <section className="border-t border-gold-200/60 bg-gold-50/40 dark:border-gold-500/20 dark:bg-gold-500/5">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-1 flex items-center gap-2">
          <Printer className="h-5 w-5 text-gold-600" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {hasSelectable ? "Seleccionar para impresión" : "Tus impresiones"}
          </h2>
        </div>
        <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
          {hasSelectable
            ? "Elige tus fotos para cada entregable incluido en tu plan. Toca una categoría y luego las fotos."
            : "Tu plan incluye las impresiones que se detallan abajo."}
        </p>

        {state.submitted && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <Check className="h-4 w-4" />
            Tu selección fue enviada. Puedes seguir ajustándola y volver a enviar.
          </div>
        )}

        {/* Impresiones automáticas: se imprimen todas, sin selección del cliente */}
        {autoCats.length > 0 && (
          <div className="mb-5 rounded-xl border border-gold-200/70 bg-white/70 px-4 py-3 text-sm text-zinc-700 dark:border-gold-500/25 dark:bg-zinc-900/40 dark:text-zinc-200">
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
              <Printer className="h-4 w-4 text-gold-600" /> Impresiones automáticas
            </p>
            <ul className="ml-5 list-disc space-y-0.5">
              {autoCats.map((c) => (
                <li key={c.key}>
                  <strong>{c.label}</strong> — se imprimirán todas tus fotos
                  entregadas
                  {c.allowed > 0 ? ` (${c.allowed})` : ""}. No requiere selección.
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasSelectable && (
          <>
            {/* Categorías (solo las que el cliente selecciona) */}
            <div className="mb-5 flex flex-wrap gap-2">
              {selectableCats.map((c) => {
                const full = c.used >= c.allowed
                const active = c.key === activeCat?.key
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActiveKey(c.key)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      active
                        ? "border-gold-500 bg-gold-100 text-gold-800 dark:border-gold-400 dark:bg-gold-500/20 dark:text-gold-200"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-gold-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                    )}
                  >
                    {full && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                    {c.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                        full
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                      )}
                    >
                      {c.used}/{c.allowed}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Grid de fotos para la categoría activa */}
            {activeCat && (
              <>
                <div className="mb-3 flex items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-300">
                  <AlertCircle className="h-4 w-4 text-gold-600" />
                  Selecciona <strong className="mx-1">{activeCat.label}</strong> —{" "}
                  {activeCat.used} de {activeCat.allowed}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {assets.map((a) => {
                    const marked = selectedInActive.has(a.id)
                    const thumb = thumbById.get(a.id)
                    const otherCount = (state.byAsset[a.id] ?? []).length
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={busyAsset === a.id || state.locked}
                        onClick={() => toggle(a.id)}
                        className={cn(
                          "group relative aspect-square overflow-hidden rounded-lg bg-zinc-200 transition-all dark:bg-zinc-800",
                          marked && "ring-2 ring-gold-500 ring-offset-2 ring-offset-gold-50 dark:ring-offset-zinc-950",
                          state.locked && "cursor-not-allowed opacity-70",
                        )}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : null}
                        {busyAsset === a.id && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          </span>
                        )}
                        {marked && (
                          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 text-white shadow">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                        {!marked && otherCount > 0 && (
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white">
                            {otherCount}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Estado + enviar */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gold-200/60 pt-5 dark:border-gold-500/20">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-600 dark:text-zinc-300">
                {selectableCats.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1">
                    {c.used >= c.allowed ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                    )}
                    {c.label} {c.used}/{c.allowed}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={pending || state.locked}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-gold-500 to-gold-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {state.submitted ? "Reenviar selección" : "Enviar selección de impresión"}
                {allComplete && !state.submitted && <Check className="h-4 w-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
