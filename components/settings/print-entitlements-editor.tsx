"use client"

import { useState } from "react"
import { Plus, Trash2, Frame, Printer, BookOpen, Image as ImageIcon } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { DEFAULT_PRINT_SIZES, type PrintEntitlements } from "@/lib/print/entitlements"

type Row = { size: string; qty: number }

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
const numCls = cn(inputCls, "w-20 text-center tabular-nums")
const sizeCls = cn(inputCls, "w-28")

export function PrintEntitlementsEditor({
  defaultValue,
}: {
  defaultValue?: PrintEntitlements
}) {
  const dv = defaultValue
  const [enabled, setEnabled] = useState(dv?.enabled ?? false)
  const [covers, setCovers] = useState(dv?.covers ?? 0)
  const [albums, setAlbums] = useState(dv?.albums ?? 0)
  const [albumSize, setAlbumSize] = useState(dv?.album_size ?? "")
  const [frames, setFrames] = useState<Row[]>(
    dv?.frames?.length ? dv.frames.map((f) => ({ ...f })) : [],
  )
  const [prints, setPrints] = useState<Row[]>(
    dv && Object.keys(dv.prints).length
      ? Object.entries(dv.prints).map(([size, qty]) => ({ size, qty }))
      : DEFAULT_PRINT_SIZES.map((size) => ({ size, qty: 0 })),
  )

  const json = JSON.stringify({
    enabled,
    covers,
    albums,
    album_size: albumSize.trim() || null,
    frames: frames
      .filter((f) => f.size.trim() && f.qty > 0)
      .map((f) => ({ size: f.size.trim(), qty: f.qty })),
    prints: Object.fromEntries(
      prints
        .filter((p) => p.size.trim() && p.qty > 0)
        .map((p) => [p.size.trim(), p.qty]),
    ),
  })

  return (
    <div className="sm:col-span-2 mt-1 rounded-xl border border-border/60 bg-muted/20 p-4">
      <input type="hidden" name="printEntitlements" value={json} />

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Printer className="h-4 w-4 text-brand" />
            Entregables impresos
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Define qué puede seleccionar el cliente desde su galería de entrega
            final (portada, marcos, impresiones).
          </p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
      </label>

      {enabled && (
        <div className="mt-4 space-y-5 border-t border-border/60 pt-4">
          {/* Álbum + portada */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" /> Portadas de álbum
              </label>
              <input
                type="number"
                min={0}
                value={covers}
                onChange={(e) => setCovers(Math.max(0, Number(e.target.value) || 0))}
                className={numCls}
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" /> Álbumes
              </label>
              <input
                type="number"
                min={0}
                value={albums}
                onChange={(e) => setAlbums(Math.max(0, Number(e.target.value) || 0))}
                className={numCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tamaño del álbum
              </label>
              <input
                value={albumSize}
                onChange={(e) => setAlbumSize(e.target.value)}
                placeholder="ej. 10x10"
                className={sizeCls}
              />
            </div>
          </div>

          {/* Marcos — tamaños editables */}
          <RowEditor
            icon={<Frame className="h-3.5 w-3.5" />}
            title="Marcos"
            hint="Agrega los tamaños de marco que incluye este plan (editables)."
            rows={frames}
            setRows={setFrames}
            addLabel="Agregar marco"
            sizePlaceholder="ej. 12x18"
          />

          {/* Impresiones — tamaños editables */}
          <RowEditor
            icon={<Printer className="h-3.5 w-3.5" />}
            title="Impresiones"
            hint="Cantidad de fotos a imprimir por tamaño. Cantidad 0 = no se incluye."
            rows={prints}
            setRows={setPrints}
            addLabel="Agregar tamaño"
            sizePlaceholder="ej. 5x7"
          />
        </div>
      )}
    </div>
  )
}

function RowEditor({
  icon,
  title,
  hint,
  rows,
  setRows,
  addLabel,
  sizePlaceholder,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  rows: Row[]
  setRows: React.Dispatch<React.SetStateAction<Row[]>>
  addLabel: string
  sizePlaceholder: string
}) {
  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.size}
              onChange={(e) => update(i, { size: e.target.value })}
              placeholder={sizePlaceholder}
              className={sizeCls}
            />
            <span className="text-xs text-muted-foreground">×</span>
            <input
              type="number"
              min={0}
              value={r.qty}
              onChange={(e) => update(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
              className={numCls}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              aria-label="Quitar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { size: "", qty: 1 }])}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand hover:text-brand"
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  )
}
