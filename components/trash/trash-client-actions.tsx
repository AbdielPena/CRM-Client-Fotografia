"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  ArrowUpFromLine,
  Loader2,
  Trash2,
} from "lucide-react"

import {
  restoreClientAction,
  permanentlyDeleteClientAction,
} from "@/server/actions/client.actions"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"

interface TrashClientActionsProps {
  clientId: string
  clientName: string
  /** Si el user actual NO puede borrar permanente (no es admin/owner). */
  canPurge: boolean
}

const PURGE_KEYWORD = "ELIMINAR"

export function TrashClientActions({
  clientId,
  clientName,
  canPurge,
}: TrashClientActionsProps) {
  const [restoring, setRestoring] = useState(false)
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRestore() {
    setRestoring(true)
    setError(null)
    try {
      await restoreClientAction(clientId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error restaurando")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          leftIcon={
            restoring ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUpFromLine className="h-3.5 w-3.5" />
            )
          }
          onClick={handleRestore}
          disabled={restoring}
        >
          Restaurar
        </Button>

        {canPurge && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => setPurgeOpen(true)}
            disabled={restoring}
            className="text-danger hover:bg-danger-soft hover:text-danger"
          >
            Eliminar permanente
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-1 text-right text-caption text-danger">{error}</p>
      )}

      <PurgeDialog
        open={purgeOpen}
        clientId={clientId}
        clientName={clientName}
        onClose={() => setPurgeOpen(false)}
      />
    </>
  )
}

// ----------------------------------------------------------------------------
// Modal dedicado: doble confirmación con palabra "ELIMINAR"
// ----------------------------------------------------------------------------

interface PurgeDialogProps {
  open: boolean
  clientId: string
  clientName: string
  onClose: () => void
}

function PurgeDialog({ open, clientId, clientName, onClose }: PurgeDialogProps) {
  const [confirmText, setConfirmText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) {
      setConfirmText("")
      setError(null)
      return
    }
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, loading, onClose])

  const canConfirm = confirmText === PURGE_KEYWORD && !loading

  async function handlePurge() {
    if (!canConfirm) return
    setLoading(true)
    setError(null)
    try {
      await permanentlyDeleteClientAction(clientId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar")
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !loading && onClose()}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Dialog */}
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="purge-dialog-title"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative w-full max-w-md rounded-xl border-2 border-danger/30 bg-popover p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start gap-3.5">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h3
                  id="purge-dialog-title"
                  className="text-body font-semibold leading-tight text-popover-foreground"
                >
                  Eliminación permanente
                </h3>
                <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">
                  Vas a borrar para siempre a{" "}
                  <strong className="text-foreground">{clientName}</strong> y
                  TODOS sus proyectos, contratos, facturas, pagos, galerías,
                  notas y bookings.
                </p>
                <p className="mt-2 text-body-sm font-semibold text-danger">
                  Esta acción NO se puede deshacer.
                </p>
              </div>
            </div>

            <div className="mb-5 rounded-md border border-danger/20 bg-danger-soft/40 p-3">
              <label
                htmlFor="purge-confirm-input"
                className="mb-1.5 block text-caption font-medium text-foreground"
              >
                Para confirmar, escribí{" "}
                <span className="rounded bg-danger px-1.5 py-0.5 font-mono text-[11px] text-white">
                  {PURGE_KEYWORD}
                </span>{" "}
                debajo:
              </label>
              <input
                id="purge-confirm-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder={PURGE_KEYWORD}
                autoFocus
                disabled={loading}
                className={cn(
                  "w-full rounded-md border bg-background px-3 py-2 font-mono text-sm",
                  "focus:outline-none focus:ring-2",
                  canConfirm
                    ? "border-danger/60 text-danger focus:ring-danger/30"
                    : "border-border focus:ring-brand/20",
                )}
              />
              {error && (
                <p className="mt-2 text-caption text-danger">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handlePurge}
                loading={loading}
                disabled={!canConfirm}
              >
                Eliminar permanentemente
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
