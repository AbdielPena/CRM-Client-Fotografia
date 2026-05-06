"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

import { deleteClientAction } from "@/server/actions/client.actions"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"

interface ClientRowActionsProps {
  clientId: string
  clientName: string
}

/**
 * Menú de acciones por fila del listado de clientes:
 *  - Ver cliente
 *  - Editar cliente
 *  - Mover a Papelera (con motivo opcional)
 */
export function ClientRowActions({
  clientId,
  clientName,
}: ClientRowActionsProps) {
  const [trashOpen, setTrashOpen] = useState(false)

  return (
    <div
      className="flex justify-end"
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Acciones para ${clientName}`}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md",
              "text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
              "data-[state=open]:opacity-100",
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className={cn(
              "z-50 min-w-[180px] overflow-hidden rounded-lg border border-border",
              "bg-card p-1 shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            <DropdownMenu.Item asChild>
              <Link
                href={`/clients/${clientId}`}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2",
                  "text-body-sm text-foreground outline-none",
                  "hover:bg-muted focus:bg-muted",
                )}
              >
                <Eye className="h-4 w-4 text-muted-foreground" />
                Ver cliente
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Item asChild>
              <Link
                href={`/clients/${clientId}/edit`}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2",
                  "text-body-sm text-foreground outline-none",
                  "hover:bg-muted focus:bg-muted",
                )}
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
                Editar cliente
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="my-1 h-px bg-border" />

            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault()
                setTrashOpen(true)
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2",
                "text-body-sm text-danger outline-none",
                "hover:bg-danger-soft focus:bg-danger-soft",
              )}
            >
              <Trash2 className="h-4 w-4" />
              Mover a Papelera
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <TrashDialog
        open={trashOpen}
        clientId={clientId}
        clientName={clientName}
        onClose={() => setTrashOpen(false)}
      />
    </div>
  )
}

// ----------------------------------------------------------------------------
// Modal de "Mover a Papelera" con motivo opcional
// ----------------------------------------------------------------------------

interface TrashDialogProps {
  open: boolean
  clientId: string
  clientName: string
  onClose: () => void
}

function TrashDialog({ open, clientId, clientName, onClose }: TrashDialogProps) {
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) {
      setReason("")
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

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      await deleteClientAction(clientId, reason.trim() || null)
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !loading && onClose()}
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="trash-dialog-title"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative w-full max-w-md rounded-xl border border-border bg-popover p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start gap-3.5">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h3
                  id="trash-dialog-title"
                  className="text-body font-semibold leading-tight text-popover-foreground"
                >
                  Mover a la Papelera
                </h3>
                <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">
                  ¿Mover a{" "}
                  <strong className="text-foreground">{clientName}</strong> a la
                  Papelera? Sus proyectos, contratos, facturas y galerías
                  también se ocultarán del listado principal. Podés restaurarlo
                  desde /trash en cualquier momento.
                </p>
              </div>
            </div>

            <div className="mb-5">
              <label
                htmlFor="trash-reason-input"
                className="mb-1.5 block text-caption font-medium text-foreground"
              >
                Motivo (opcional)
              </label>
              <textarea
                id="trash-reason-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: cliente canceló contrato, datos duplicados…"
                rows={2}
                disabled={loading}
                maxLength={500}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-body-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <p className="mt-1 text-caption text-muted-foreground">
                Quedará registrado en el log de auditoría.
              </p>
              {error && <p className="mt-2 text-caption text-danger">{error}</p>}
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
                onClick={handleConfirm}
                loading={loading}
              >
                Mover a Papelera
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
