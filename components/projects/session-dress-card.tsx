"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Shirt, UploadCloud, Loader2, ImageIcon } from "lucide-react"
import { toast } from "sonner"

import { saveSessionDressAction } from "@/server/actions/project.actions"
import { cn } from "@/lib/utils/cn"

/**
 * Vestido de la sesión (planes Luxury que incluyen el vestido). Se registra a
 * mano: foto + nombre + proveedor + costo. El costo se resta de la ganancia
 * neta del proyecto (cálculo interno del CRM). NO toca la app de Finanzas.
 */
export function SessionDressCard({
  projectId,
  dressName,
  dressProvider,
  dressCost,
  dressNotes,
  dressImageUrl,
}: {
  projectId: string
  dressName: string | null
  dressProvider: string | null
  dressCost: number | null
  dressNotes: string | null
  dressImageUrl: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(dressName ?? "")
  const [provider, setProvider] = useState(dressProvider ?? "")
  const [cost, setCost] = useState(dressCost != null ? String(dressCost) : "")
  const [notes, setNotes] = useState(dressNotes ?? "")
  const [imageUrl, setImageUrl] = useState(dressImageUrl ?? "")
  const [busy, start] = useTransition()

  const save = () => {
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
  }

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
            Costo del vestido (se resta de la ganancia neta)
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
