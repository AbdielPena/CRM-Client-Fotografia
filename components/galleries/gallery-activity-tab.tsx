import { Eye, Download, Heart, Users } from "lucide-react"

interface Activity {
  views: number
  lastViewedAt: string | null
  downloads: number
  favoritesTotal: number
  uniqueVisitors: number
  topFavorites: Array<{ assetId: string; count: number; thumbUrl: string | null }>
}

export function GalleryActivityTab({ activity }: { activity: Activity }) {
  const stats = [
    { label: "Vistas", value: activity.views, icon: Eye },
    { label: "Visitantes", value: activity.uniqueVisitors, icon: Users },
    { label: "Favoritos", value: activity.favoritesTotal, icon: Heart },
    { label: "Descargas", value: activity.downloads, icon: Download },
  ]
  const lastViewed = activity.lastViewedAt
    ? new Date(activity.lastViewedAt).toLocaleString("es")
    : "Aún sin abrir"

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="sf-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <span className="text-xs">{s.label}</span>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{s.value}</p>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Última apertura: <strong className="text-foreground">{lastViewed}</strong>
      </p>

      {activity.topFavorites.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Fotos más marcadas</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {activity.topFavorites.map((f) => (
              <div
                key={f.assetId}
                className="relative aspect-square overflow-hidden rounded-md bg-muted"
              >
                {f.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.thumbUrl} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                  <Heart className="h-2.5 w-2.5" fill="currentColor" />
                  {f.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activity.views === 0 && (
        <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          Cuando compartas la galería y el cliente la abra, verás aquí sus vistas, favoritos y
          descargas — útil para dar seguimiento (&ldquo;te envié las fotos y aún no las abriste&rdquo;).
        </p>
      )}
    </div>
  )
}
