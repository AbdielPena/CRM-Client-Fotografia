"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Star, ExternalLink, MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { setFinalDressAction } from "@/server/actions/dress-catalog.actions"

type SelectionDress = {
  name: string
  image: string | null
  rentalPrice: number | null
  deposit: number | null
  storeName: string | null
  isFinal: boolean
}
export type Selection = {
  token: string
  clientName: string
  clientWhatsapp: string | null
  tentativeDate: string | null
  planInterest: string | null
  createdAt: string
  dresses: SelectionDress[]
  finalImages: string[]
  matched: number
}

const rd = (n: number | null | undefined) =>
  n == null ? "—" : "RD$" + Number(n).toLocaleString("es-DO")
const APP = process.env.NEXT_PUBLIC_APP_URL || "https://my.abbypixel.com"

/**
 * Vista de una selección de vestidos del cliente (admin). Muestra cada vestido
 * con su precio como INFORMACIÓN (no se suma a ningún lado) y permite marcar
 * cuál(es) eligió finalmente la clienta.
 */
export function SelectionView({
  selection,
  showHeader = true,
}: {
  selection: Selection
  showHeader?: boolean
}) {
  const [finals, setFinals] = useState<Set<string>>(new Set(selection.finalImages))
  const [, startTransition] = useTransition()

  function toggle(image: string | null) {
    if (!image) return
    const makeFinal = !finals.has(image)
    setFinals((prev) => {
      const n = new Set(prev)
      makeFinal ? n.add(image) : n.delete(image)
      return n
    })
    startTransition(async () => {
      const r = await setFinalDressAction(selection.token, image, makeFinal)
      if ("error" in r) {
        toast.error(r.error)
        setFinals((prev) => {
          const n = new Set(prev)
          makeFinal ? n.delete(image) : n.add(image)
          return n
        })
      } else {
        setFinals(new Set(r.finalImages))
        toast.success(makeFinal ? "Marcado como elegido" : "Desmarcado")
      }
    })
  }

  const date = new Date(selection.createdAt).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const waNum = (selection.clientWhatsapp || "").replace(/\D/g, "")

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {showHeader && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{selection.clientName}</p>
            <p className="text-xs text-muted-foreground">
              {selection.dresses.length} vestidos · {date}
              {selection.planInterest ? ` · ${selection.planInterest}` : ""}
              {selection.tentativeDate ? ` · ${selection.tentativeDate}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {waNum && (
              <a
                href={`https://wa.me/${waNum.length <= 10 ? "1" + waNum : waNum}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            <a
              href={`${APP}/vestidos/${selection.token}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver link
            </a>
          </div>
        </div>
      )}

      <p className="mb-2 text-[11px] text-muted-foreground">
        Toca la ⭐ para marcar el vestido que eligió finalmente. El precio es solo informativo (no se suma).
      </p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {selection.dresses.map((d, i) => {
          const isFinal = d.image ? finals.has(d.image) : false
          return (
            <div
              key={i}
              className={cn(
                "relative overflow-hidden rounded-lg border bg-background transition-colors",
                isFinal ? "border-amber-400 ring-2 ring-amber-300" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(d.image)}
                title={isFinal ? "Quitar de elegido" : "Marcar como elegido final"}
                className={cn(
                  "absolute right-1.5 top-1.5 z-10 rounded-full p-1.5 backdrop-blur transition-colors",
                  isFinal ? "bg-amber-400 text-white" : "bg-black/45 text-white hover:bg-black/65",
                )}
              >
                <Star className={cn("h-3.5 w-3.5", isFinal && "fill-current")} />
              </button>
              <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
                {d.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.image} alt={d.name} loading="lazy" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate text-[11px] font-medium text-foreground" title={d.name}>
                  {d.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {d.rentalPrice == null ? "sin precio" : rd(d.rentalPrice)}
                </p>
                {d.storeName && (
                  <p className="truncate text-[10px] text-muted-foreground/70" title={d.storeName}>
                    🏬 {d.storeName}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {finals.size > 0 && (
        <p className="mt-3 text-xs text-amber-600">
          ⭐ {finals.size} vestido{finals.size === 1 ? "" : "s"} marcado{finals.size === 1 ? "" : "s"} como elegido final.
        </p>
      )}
    </div>
  )
}
