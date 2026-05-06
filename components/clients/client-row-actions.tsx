"use client"

import Link from "next/link"
import { useState } from "react"
import { Eye, Pencil, Trash2, MoreHorizontal } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

import { deleteClientAction } from "@/server/actions/client.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { cn } from "@/lib/utils/cn"

interface ClientRowActionsProps {
  clientId: string
  clientName: string
}

/**
 * Menú de acciones por fila del listado de clientes.
 * Compacto en desktop (visible on hover en la fila), siempre visible en mobile.
 */
export function ClientRowActions({ clientId, clientName }: ClientRowActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div
      className="flex justify-end"
      // Evitamos que el click en el menú dispare la navegación de la fila.
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
              // En desktop solo aparece on hover, en mobile siempre visible
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
                // Prevenimos el cierre default y abrimos el ConfirmDialog
                e.preventDefault()
                setConfirmOpen(true)
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2",
                "text-body-sm text-danger outline-none",
                "hover:bg-danger-soft focus:bg-danger-soft",
              )}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar cliente
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* ConfirmDialog controlado por estado para abrirlo desde el menú */}
      <ConfirmDialog
        title="Eliminar cliente"
        description={`¿Seguro que deseas eliminar a "${clientName}"? Sus proyectos, contratos y facturas se conservarán como histórico (soft delete).`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        danger
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => deleteClientAction(clientId)}
      />
    </div>
  )
}
