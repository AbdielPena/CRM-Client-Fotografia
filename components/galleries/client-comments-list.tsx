import { MessageSquare } from "lucide-react"

export type AssetCommentItem = {
  assetId: string
  email: string
  body: string
  createdAt: string
  thumbUrl: string | null
  /**
   * Nombre del archivo de la foto comentada. Es el MISMO que sale en "Copiar
   * nombres", para poder buscarla en Lightroom/Photoshop sin adivinar: la
   * miniatura sola no dice cuál de las 300 fotos es.
   */
  originalName: string | null
}

/** Comentarios que el cliente dejó por foto en la galería de selección. */
export function ClientCommentsList({ items }: { items: AssetCommentItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="mb-5 rounded-xl border border-border bg-muted/30 p-3.5">
      <p className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
        <MessageSquare className="h-3.5 w-3.5" /> Comentarios del cliente ({items.length})
      </p>
      <ul className="space-y-2.5">
        {items.map((c, i) => (
          <li key={`${c.assetId}-${i}`} className="flex items-start gap-2.5">
            <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
              {c.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumbUrl}
                  alt={c.originalName ?? ""}
                  title={c.originalName ?? undefined}
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              {c.originalName && (
                <p
                  className="truncate font-mono text-[11px] font-medium text-foreground/70"
                  title={c.originalName}
                >
                  {c.originalName}
                </p>
              )}
              <p className="text-[13px] leading-snug text-foreground">“{c.body}”</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{c.email}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
