"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Check, Copy, Download, ImageIcon } from "lucide-react"
import { toast } from "sonner"

import { setGalleryInstagramPostedAction } from "@/server/actions/gallery.actions"

export type IgItem = {
  id: string
  name: string
  cover: string | null
  token: string | null
  deliveredDate: string | null
  posted: boolean
}

/**
 * Checklist de galerías ENTREGADAS con marca "publicado en Instagram" + link de
 * descarga a mano. Las pendientes van arriba; las publicadas se atenúan. La marca
 * se guarda al vuelo (optimista) vía `setGalleryInstagramPostedAction`.
 */
export function InstagramChecklist({ items }: { items: IgItem[] }) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.posted])),
  )
  const [, startTransition] = useTransition()

  function toggle(id: string) {
    const next = !state[id]
    setState((s) => ({ ...s, [id]: next }))
    startTransition(async () => {
      const res = await setGalleryInstagramPostedAction(id, next)
      if (res?.error) {
        setState((s) => ({ ...s, [id]: !next }))
        toast.error(res.error)
      }
    })
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No hay galerías entregadas todavía. Cuando subas las fotos finales de una sesión,
        aparecerá aquí para llevar el orden de lo que ya publicaste en Instagram.
      </p>
    )
  }

  const pending = items.filter((i) => !state[i.id]).length
  const done = items.length - pending
  // Pendientes primero; dentro de cada grupo, se respeta el orden recibido.
  const ordered = [...items].sort((a, b) => Number(state[a.id]) - Number(state[b.id]))

  return (
    <div>
      <div className="mb-4 flex items-center gap-4 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-amber-500" /> {pending} por
          publicar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-emerald-500" /> {done} publicada
          {done === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {ordered.map((it, i) => {
          const on = !!state[it.id]
          return (
            <div
              key={it.id}
              className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${
                i > 0 ? "border-t border-border" : ""
              } ${on ? "bg-emerald-50/40 dark:bg-emerald-500/[0.06]" : ""}`}
            >
              <button
                type="button"
                onClick={() => toggle(it.id)}
                aria-label={on ? "Marcar como pendiente" : "Marcar como publicada en Instagram"}
                className={`grid size-6 shrink-0 place-items-center rounded-md border transition-colors ${
                  on
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border hover:border-emerald-500"
                }`}
              >
                {on && <Check className="size-4" />}
              </button>

              <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                {it.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.cover} alt="" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-muted-foreground/40">
                    <ImageIcon className="size-5" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/galleries/${it.id}`}
                  className={`block truncate text-[13.5px] font-medium hover:underline ${
                    on ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {it.name}
                </Link>
                <span className="text-[11px] text-muted-foreground">
                  {it.deliveredDate ? `Entregada · ${it.deliveredDate}` : "Entregada"}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {it.token ? (
                  <>
                    <a
                      href={`/g/${it.token}?entrega=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] font-medium hover:bg-muted"
                    >
                      <Download className="size-3.5" /> Descargar
                    </a>
                    <CopyLink token={it.token} />
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">sin link</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/g/${token}?entrega=1`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar")
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copiar link de descarga"
      className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  )
}
