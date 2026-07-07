"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils/cn"

/**
 * Tarjeta colapsable con encabezado siempre visible (icono + título + resumen
 * opcional a la derecha) y cuerpo desplegable. Pensada para las páginas largas
 * (detalle de sesión / perfil de cliente): reduce el ruido en pantalla dejando
 * ver solo los títulos y expandiendo lo que haga falta.
 */
export function CollapsibleCard({
  title,
  icon,
  summary,
  defaultOpen = false,
  children,
  className,
}: {
  title: string
  icon?: React.ReactNode
  /** Texto/nodo pequeño a la derecha del título (resumen visible al estar plegado). */
  summary?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div className={cn("sf-card overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {summary != null && (
          <span className="ml-auto truncate text-[12px] text-muted-foreground">{summary}</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-none text-muted-foreground transition-transform",
            summary == null && "ml-auto",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t border-border/60 px-5 py-4">{children}</div>}
    </div>
  )
}
