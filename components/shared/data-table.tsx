"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"

/**
 * DataTable shell — wrapper estilizado para tablas internas.
 * No maneja datos; solo provee el contenedor, header y estilos consistentes.
 *
 * Uso:
 *   <DataTable>
 *     <DataTableHeader>
 *       <DataTableColumn>Nombre</DataTableColumn>
 *       ...
 *     </DataTableHeader>
 *     <DataTableBody>
 *       <DataTableRow>
 *         <DataTableCell>...</DataTableCell>
 *       </DataTableRow>
 *     </DataTableBody>
 *   </DataTable>
 */

export function DataTable({
  children,
  footer,
  className,
}: {
  children: React.ReactNode
  /** Slot opcional — se renderiza fuera de la tabla, dentro del card exterior. */
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-body-sm">{children}</table>
      </div>
      {footer}
    </div>
  )
}

export function DataTableHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <thead>
      <tr
        className={cn(
          "border-b border-border bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        {children}
      </tr>
    </thead>
  )
}

export function DataTableColumn({
  children,
  className,
  align = "left",
}: {
  children: React.ReactNode
  className?: string
  align?: "left" | "right" | "center"
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-overline font-semibold uppercase tracking-[0.1em]",
        align === "left" && "text-left",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  )
}

export function DataTableBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <tbody className={cn("divide-y divide-border/60", className)}>
      {children}
    </tbody>
  )
}

export function DataTableRow({
  children,
  className,
  interactive,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  interactive?: boolean
  onClick?: () => void
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors duration-fast",
        interactive &&
          "cursor-pointer hover:bg-muted/40 focus-within:bg-muted/40",
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function DataTableCell({
  children,
  className,
  align = "left",
}: {
  children: React.ReactNode
  className?: string
  align?: "left" | "right" | "center"
}) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 text-body-sm text-foreground",
        align === "left" && "text-left",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  )
}

export function DataTableFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center",
        className,
      )}
    >
      {children}
    </div>
  )
}
