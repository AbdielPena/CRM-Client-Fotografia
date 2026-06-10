/**
 * Skeleton genérico para el área de estudio. Se muestra mientras una página
 * bajo (studio) resuelve sus queries de servidor. Las secciones con su propio
 * loading.tsx (ej. /dashboard) usan el suyo; esto es el fallback para el resto.
 */
export default function StudioLoading() {
  return (
    <>
      {/* Control bar placeholder (h-12, igual que el topbar real) */}
      <div className="h-12 border-b border-border bg-background/85" />

      {/* Hero placeholder */}
      <div className="flex flex-col gap-3 px-6 pt-6 pb-4 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="min-w-0 space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-muted/60" />
          <div className="h-6 w-44 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-muted/50" />
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* Content placeholder — filas tipo lista/tabla */}
      <div className="space-y-3 px-6 py-6 lg:px-8">
        <div className="h-10 w-full max-w-sm animate-pulse rounded-md bg-muted/60" />
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-0"
            >
              <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-56 animate-pulse rounded bg-muted/50" />
              </div>
              <div className="h-3 w-16 animate-pulse rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
