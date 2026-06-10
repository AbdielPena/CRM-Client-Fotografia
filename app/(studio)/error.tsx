"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Error boundary raíz del área de estudio. Cualquier página bajo (studio) que
 * lance en render/queries cae acá en vez de devolver un 500 crudo. Las secciones
 * con su propio error.tsx (ej. /settings) lo siguen manejando localmente.
 */
export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[studio] uncaught error", error)
  }, [error])

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="sf-card flex flex-col items-start gap-4 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            Algo salió mal
          </h1>
          <p className="text-body-sm text-muted-foreground">
            No pudimos cargar esta sección. Probá recargar; si el error persiste
            te dejamos los detalles abajo para reportarlo.
          </p>
        </div>

        {error?.message && (
          <pre className="w-full overflow-auto rounded-md bg-muted/40 p-3 text-caption text-muted-foreground">
            {error.message}
            {error.digest ? `\n\nID: ${error.digest}` : ""}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button onClick={() => reset()} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Reintentar
          </Button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-body-sm hover:bg-muted/40 transition-colors"
          >
            <LayoutDashboard className="h-4 w-4" />
            Ir al panel
          </Link>
        </div>
      </div>
    </div>
  )
}
