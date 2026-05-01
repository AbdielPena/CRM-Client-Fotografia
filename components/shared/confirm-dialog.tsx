"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Info } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  children: React.ReactNode
  danger?: boolean
}

/**
 * Confirm dialog — con portal, focus trap básico, animación spring y tokens.
 * Compat: envuelve el trigger en un <span> con onClick; la API pública no cambia.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  children,
  danger = false,
}: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const confirmBtnRef = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    // Focus confirm button after mount (slight delay for animation)
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 50)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
      clearTimeout(t)
    }
  }, [open, loading])

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <span
        onClick={() => setOpen(true)}
        className="contents"
      >
        {children}
      </span>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => !loading && setOpen(false)}
                  className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
                  aria-hidden="true"
                />

                {/* Dialog */}
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="confirm-dialog-title"
                  initial={{ opacity: 0, scale: 0.94, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 4 }}
                  transition={{
                    duration: 0.22,
                    ease: [0.34, 1.56, 0.64, 1],
                  }}
                  className={cn(
                    "relative w-full max-w-sm rounded-xl border border-border bg-popover p-6 shadow-xl",
                  )}
                >
                  <div className="mb-5 flex items-start gap-3.5">
                    <div
                      className={cn(
                        "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full",
                        danger
                          ? "bg-danger-soft text-danger"
                          : "bg-warning-soft text-warning",
                      )}
                    >
                      {danger ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : (
                        <Info className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <h3
                        id="confirm-dialog-title"
                        className="text-body font-semibold leading-tight text-popover-foreground"
                      >
                        {title}
                      </h3>
                      <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpen(false)}
                      disabled={loading}
                    >
                      {cancelLabel}
                    </Button>
                    <Button
                      ref={confirmBtnRef}
                      variant={danger ? "destructive" : "default"}
                      size="sm"
                      onClick={handleConfirm}
                      loading={loading}
                    >
                      {confirmLabel}
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
