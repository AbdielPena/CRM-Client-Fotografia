"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils/cn"

interface PaginationProps {
  /** Página actual (1-based). */
  page: number
  /** Total de páginas. */
  totalPages: number
  /** Total de items (para la leyenda "x–y de z"). */
  total: number
  /** Tamaño de página (para leyenda). */
  pageSize: number
  /** Base del href (sin querystring). */
  baseHref: string
  /** Query a preservar al navegar. */
  preserveQuery?: Record<string, string | undefined>
  /** Label del item en plural (default "resultados"). */
  itemsLabel?: string
  /** Si false, desactiva el prefetch (evita servir shell sin contenido en soft-nav). */
  prefetch?: boolean
  className?: string
}

/**
 * Pagination — diseño alineado con DataTableFooter; usa tokens semánticos.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  baseHref,
  preserveQuery = {},
  itemsLabel = "resultados",
  prefetch,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    Object.entries(preserveQuery).forEach(([k, v]) => {
      if (v) params.set(k, v)
    })
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div
      className={cn(
        "flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center",
        className,
      )}
    >
      <p className="text-caption text-muted-foreground">
        Mostrando{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {from}–{to}
        </span>{" "}
        de{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {total}
        </span>{" "}
        {itemsLabel}
      </p>

      <div className="flex items-center gap-1">
        {canPrev ? (
          <Link
            href={buildHref(page - 1)}
            prefetch={prefetch}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-caption font-medium text-foreground",
              "transition-colors duration-fast hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            )}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2.5 text-caption font-medium text-muted-foreground">
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </span>
        )}

        <span className="mx-1 text-caption tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{page}</span> /{" "}
          {totalPages}
        </span>

        {canNext ? (
          <Link
            href={buildHref(page + 1)}
            prefetch={prefetch}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-caption font-medium text-foreground",
              "transition-colors duration-fast hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            )}
            aria-label="Página siguiente"
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2.5 text-caption font-medium text-muted-foreground">
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  )
}
