/**
 * Skeleton loader para el dashboard mientras se cargan las queries.
 * Muestra los placeholders con la misma estructura visual que el dashboard
 * real para evitar layout shift al renderizar.
 */
export default function DashboardLoading() {
  return (
    <>
      {/* Topbar placeholder */}
      <div className="h-14 border-b border-border bg-card" />

      {/* Header */}
      <div className="flex flex-col gap-3 px-6 pt-6 pb-2 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="min-w-0 space-y-2">
          <div className="h-6 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-muted/60" />
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      <div className="px-6 pb-12 pt-4 lg:px-8">
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-5 space-y-3"
              >
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-8 w-32 animate-pulse rounded bg-muted/80" />
                <div className="h-3 w-28 animate-pulse rounded bg-muted/50" />
              </div>
            ))}
          </div>

          {/* Chart row */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
              <div className="mb-4 h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-[260px] animate-pulse rounded-lg bg-muted/40" />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-12 animate-pulse rounded bg-muted/60" />
                  </div>
                  <div className="h-2 w-full animate-pulse rounded-full bg-muted/40" />
                </div>
              ))}
            </div>
          </div>

          {/* Activity row */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="h-5 w-36 animate-pulse rounded bg-muted" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-lg bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-56 animate-pulse rounded bg-muted/50" />
                  </div>
                  <div className="h-3 w-12 animate-pulse rounded bg-muted/40" />
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="h-5 w-36 animate-pulse rounded bg-muted" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-lg bg-muted" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-20 animate-pulse rounded bg-muted/50" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
