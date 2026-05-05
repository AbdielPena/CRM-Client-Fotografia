"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Pen, Trash2, Loader2, Check, Eraser } from "lucide-react"
import { toast } from "sonner"

import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/public/signature-pad"

export function StudioSignatureCard() {
  const [current, setCurrent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const padRef = useRef<SignaturePadHandle | null>(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    fetch("/api/settings/studio-signature")
      .then((r) => r.json())
      .then((d: { signatureImageUrl?: string | null }) => {
        setCurrent(d.signatureImageUrl ?? null)
      })
      .finally(() => setLoading(false))
  }, [])

  const save = () => {
    const dataUrl = padRef.current?.getDataUrl()
    if (!dataUrl) {
      toast.error("Firmá en el cuadro")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/settings/studio-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureImageDataUrl: dataUrl }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || data.error) {
        toast.error(data.error ?? "No se pudo guardar")
        return
      }
      setCurrent(dataUrl)
      setEditing(false)
      toast.success("Firma guardada — se aplicará automáticamente al firmar contratos")
    })
  }

  const remove = () => {
    if (!confirm("¿Borrar la firma del estudio? Tendrás que cargarla nuevamente.")) return
    startTransition(async () => {
      const res = await fetch("/api/settings/studio-signature", { method: "DELETE" })
      if (!res.ok) {
        toast.error("No se pudo borrar")
        return
      }
      setCurrent(null)
      toast.success("Firma eliminada")
    })
  }

  return (
    <div className="sf-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Firma reusable del estudio
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Cargá tu firma una vez y se aplicará automáticamente cuando firmes
            cualquier contrato desde el panel.
          </p>
        </div>
        <Pen className="h-4 w-4 text-muted-foreground" />
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando…
        </div>
      ) : current && !editing ? (
        <>
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current}
              alt="Firma del estudio"
              className="max-h-24 rounded bg-white p-2 dark:bg-zinc-100"
            />
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Check className="h-3 w-3" />
              Activa
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              <Eraser className="mr-1 inline h-3 w-3" />
              Cambiar firma
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Trash2 className="mr-1 inline h-3 w-3" />
              Eliminar
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <SignaturePad ref={padRef} onChange={setEmpty} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || empty}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pen className="h-3.5 w-3.5" />}
              Guardar firma
            </button>
            {current && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
