"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, ChevronLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Error boundary global para todas las páginas bajo /settings.
 * Evita que un fallo en services/queries devuelva un 500 crudo:
 * en su lugar mostramos UI controlada con opción de reintentar.
 */
export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log al server (Next captura console.error en SSR; en cliente queda en consola).
    console.error("[settings] uncaught error", error)
  }, [error])

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="sf-card flex flex-col items-start gap-4 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            Algo salió mal en esta sección
          </h1>
          <p className="text-body-sm text-muted-foreground">
            No pudimos cargar el contenido. Probá recargar; si el error persiste
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
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-body-sm hover:bg-muted/40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver a Configuración
          </Link>
        </div>
      </div>
    </div>
  )
}
