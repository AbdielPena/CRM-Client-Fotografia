"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Eye, EyeOff, Trash2, Upload, X, ImageOff, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { PortfolioCategory, PortfolioItem } from "@/server/services/portfolio.service"
import {
  removePortfolioItemAction,
  togglePortfolioPublishedAction,
  updatePortfolioItemAction,
  uploadPortfolioItemAction,
} from "@/server/actions/portfolio.actions"

export function PortfolioManager({
  categories,
  items,
}: {
  categories: PortfolioCategory[]
  items: PortfolioItem[]
}) {
  const router = useRouter()
  const [cat, setCat] = React.useState<string>("")
  const [uploading, setUploading] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const visible = cat ? items.filter((i) => i.categoryId === cat) : items

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    // Se sube a la categoría que estés viendo; si es "Todas", pide una.
    const target = cat || categories[0]?.id
    if (!target) {
      toast.error("Crea una categoría primero")
      return
    }
    setUploading(true)
    let ok = 0
    for (const file of files) {
      const fd = new FormData()
      fd.set("file", file)
      fd.set("categoryId", target)
      fd.set("title", file.name.replace(/\.[^.]+$/, ""))
      const r = await uploadPortfolioItemAction(fd)
      if (r?.success) ok++
      else toast.error(r?.error ?? `No se pudo subir ${file.name}`)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
    if (ok > 0) {
      toast.success(`${ok} ${ok === 1 ? "foto subida" : "fotos subidas"} — en borrador`)
      router.refresh()
    }
  }

  async function togglePublish(item: PortfolioItem) {
    setBusy(item.id)
    const r = await togglePortfolioPublishedAction(item.id, !item.published)
    setBusy(null)
    if (r?.success) {
      toast.success(item.published ? "Quitada de la web" : "Publicada en la web")
      router.refresh()
    } else toast.error(r?.error ?? "Error")
  }

  async function remove(item: PortfolioItem) {
    setBusy(item.id)
    const r = await removePortfolioItemAction(item.id)
    setBusy(null)
    if (r?.success) {
      toast.success("Quitada del portafolio")
      router.refresh()
    } else toast.error(r?.error ?? "Error")
  }

  async function changeCategory(item: PortfolioItem, categoryId: string) {
    const r = await updatePortfolioItemAction(item.id, { categoryId })
    if (r?.success) router.refresh()
    else toast.error(r?.error ?? "Error")
  }

  return (
    <div className="space-y-4">
      {/* Filtro por categoría + subida manual */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCat("")}
          className={cn(
            "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
            !cat ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          Todas ({items.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              cat === c.id
                ? "bg-brand text-brand-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {c.name} ({c.itemCount})
          </button>
        ))}

        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted">
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? "Subiendo…" : "Subir fotos"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={onUpload}
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="sf-card py-16 text-center">
          <ImageOff className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {items.length === 0 ? "El portafolio está vacío" : "Nada en esta categoría"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Entra a una galería, marca las fotos que quieras enseñar y dale a
            «Añadir al Portafolio». O súbelas directamente con el botón de arriba.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="relative aspect-[4/5] bg-muted">
                <Image
                  src={item.imageUrl}
                  alt={item.title ?? "Foto del portafolio"}
                  fill
                  sizes="(max-width:640px) 50vw, (max-width:1280px) 25vw, 20vw"
                  className="object-cover"
                  unoptimized
                />
                {!item.published && (
                  <span className="absolute left-2 top-2 rounded-full bg-amber-500/95 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Borrador
                  </span>
                )}
                {item.published && (
                  <span className="absolute left-2 top-2 rounded-full bg-emerald-500/95 px-2 py-0.5 text-[10px] font-semibold text-white">
                    En la web
                  </span>
                )}

                {/* Acciones */}
                <div className="absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-black/75 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => togglePublish(item)}
                    disabled={busy === item.id}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/95 px-2 py-1.5 text-[11px] font-semibold text-neutral-900 transition-colors hover:bg-white disabled:opacity-50"
                  >
                    {busy === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : item.published ? (
                      <>
                        <EyeOff className="h-3 w-3" /> Quitar
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" /> Publicar
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    disabled={busy === item.id}
                    title="Quitar del portafolio"
                    className="rounded-lg bg-white/95 p-1.5 text-red-600 transition-colors hover:bg-white disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 p-2.5">
                <p className="truncate text-[12px] font-medium text-foreground">
                  {item.title ?? "Sin título"}
                </p>
                <select
                  value={item.categoryId ?? ""}
                  onChange={(e) => changeCategory(item, e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand/40"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
