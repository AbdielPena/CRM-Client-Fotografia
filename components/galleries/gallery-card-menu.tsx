"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2, MoreVertical, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteGalleryAction } from "@/server/actions/gallery.actions"

/**
 * Menú (⋮) por tarjeta en la LISTA de galerías: permite eliminar una galería
 * sin entrar a su detalle. La tarjeta es un <Link>, así que todo click para el
 * evento (preventDefault + stopPropagation) para no navegar; el menú y el modal
 * se portalan a document.body para no ser recortados por el `overflow-hidden`
 * de la tarjeta. El borrado es SOFT (va a la papelera, recuperable 30 días).
 */
export function GalleryCardMenu({
  galleryId,
  galleryName,
  assetCount,
}: {
  galleryId: string
  galleryName: string
  assetCount: number
}) {
  const router = useRouter()
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuPos, setMenuPos] = React.useState<{ top: number; right: number } | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const openMenu = (e: React.MouseEvent) => {
    stop(e)
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setMenuOpen(true)
  }

  const onDelete = async (e: React.MouseEvent) => {
    stop(e)
    setDeleting(true)
    try {
      await deleteGalleryAction(galleryId)
      toast.success("Galería movida a la papelera")
      setConfirmOpen(false)
      router.refresh()
    } catch {
      toast.error("No se pudo eliminar la galería")
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Opciones de la galería"
        onClick={openMenu}
        className="-mr-1 -mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {menuOpen &&
        menuPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[55]" onClick={(e) => { stop(e); setMenuOpen(false) }} />
            <div
              onClick={stop}
              style={{ top: menuPos.top, right: menuPos.right }}
              className="fixed z-[56] w-48 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
            >
              <button
                type="button"
                onClick={(e) => {
                  stop(e)
                  setMenuOpen(false)
                  setConfirmOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar galería
              </button>
            </div>
          </>,
          document.body,
        )}

      {confirmOpen &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={stop}>
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={(e) => {
                stop(e)
                if (!deleting) setConfirmOpen(false)
              }}
            />
            <div
              onClick={stop}
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md rounded-xl border border-danger/40 bg-card p-6"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    Eliminar &quot;{galleryName}&quot;
                  </h3>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    {assetCount} foto{assetCount === 1 ? "" : "s"} · Se moverá a la papelera y su
                    enlace público dejará de funcionar. Podrás restaurarla (se purga a los 30 días).
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={(e) => {
                    stop(e)
                    setConfirmOpen(false)
                  }}
                  className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onDelete}
                  className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-danger-foreground transition-colors hover:bg-danger/90 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Eliminar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
