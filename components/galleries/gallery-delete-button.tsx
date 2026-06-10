"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { AlertTriangle, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteGalleryAction } from "@/server/actions/gallery.actions"

interface Props {
  galleryId: string
  galleryName: string
  assetCount: number
  selectionSubmitted: boolean
  /** Email de quien envió la selección (si existe). */
  selectionSubmittedBy?: string | null
  /** Nombre/email del cliente vinculado (si existe). */
  clientLabel?: string | null
}

/**
 * Botón "Eliminar galería" con confirmación fuerte: muestra el impacto real
 * (fotos, selección del cliente, acceso público) y exige escribir el nombre
 * exacto de la galería para habilitar el botón rojo. Evita borrados por error.
 */
export function GalleryDeleteButton({
  galleryId,
  galleryName,
  assetCount,
  selectionSubmitted,
  selectionSubmittedBy,
  clientLabel,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [deleting, setDeleting] = useState(false)

  // Cerrar con Escape + bloquear scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  const nameMatches = typed.trim() === galleryName.trim()

  const onConfirm = async () => {
    setDeleting(true)
    try {
      await deleteGalleryAction(galleryId)
      toast.success("Galería movida a la papelera")
      router.push("/galleries")
      router.refresh()
    } catch {
      toast.error("No se pudo eliminar la galería")
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTyped("")
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Eliminar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-full max-w-lg"
              role="dialog"
              aria-modal="true"
            >
              <div className="rounded-xl border border-danger/40 bg-card p-6">
                <div className="mb-4 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      Eliminar &quot;{galleryName}&quot;
                    </h3>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      La galería se moverá a la papelera y dejará de ser accesible.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
                  <p className="text-[13px] font-semibold text-danger">
                    ⚠️ Al eliminarla se pierde el acceso a:
                  </p>
                  <ul className="mt-2 space-y-1 text-[12.5px] text-foreground">
                    <li>
                      • <strong>{assetCount}</strong> foto{assetCount === 1 ? "" : "s"} subida
                      {assetCount === 1 ? "" : "s"}
                    </li>
                    {selectionSubmitted && (
                      <li>
                        • La <strong>selección ya enviada</strong>
                        {selectionSubmittedBy ? (
                          <span className="text-muted-foreground"> por {selectionSubmittedBy}</span>
                        ) : null}{" "}
                        quedará oculta
                      </li>
                    )}
                    {clientLabel && (
                      <li>
                        • El enlace público que usa{" "}
                        <span className="text-muted-foreground">{clientLabel}</span> dejará de
                        funcionar
                      </li>
                    )}
                    <li>• Favoritos, listas y PINs de descarga de esta galería</li>
                  </ul>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    💡 Podrás restaurarla desde la <strong>Papelera</strong> (se purga a los 30
                    días).
                  </p>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Para confirmar, escribe el nombre exacto de la galería:
                  </label>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={galleryName}
                    autoFocus
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/20"
                  />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!nameMatches || deleting}
                    onClick={onConfirm}
                    className="inline-flex items-center gap-2 rounded-lg bg-danger px-5 py-2.5 text-sm font-medium text-danger-foreground transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Eliminar definitivamente
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg bg-muted px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </>
  )
}
