"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, AlertTriangle, Heart, Loader2, Sparkles } from "lucide-react"

type Asset = {
  id: string
  original_name: string
  status: string
  set_id: string | null
  delivery_track?: "social" | "high_quality" | null
  thumbUrl: string | null
}

type CollectionRow = {
  id: string
  name: string
  asset_count: number
  is_locked: boolean
  submitted_at: string | null
  client_name: string | null
}

type FavoriteSelectionRow = {
  clientEmail: string
  assetIds: string[]
  submitted: boolean
  submittedAt: string | null
}

/** Nombre normalizado para comparar selección vs entrega (sin extensión). */
function norm(name: string): string {
  return name
    .replace(/\.[^./\\]+$/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

/**
 * Tab "Validar entrega": compara lo que el cliente SELECCIONÓ (favoritos +
 * colecciones enviadas) contra lo que el fotógrafo SUBIÓ a las carpetas de
 * entrega final (Máxima Calidad / Redes). Reporta faltantes y extras por nombre.
 */
export function ValidateDeliveryTab({
  galleryId,
  assets,
  favorites,
  collections,
}: {
  galleryId: string
  assets: Asset[]
  favorites: FavoriteSelectionRow[]
  collections: CollectionRow[]
}) {
  const [collItems, setCollItems] = useState<Record<string, string[]> | null>(null)
  const [loading, setLoading] = useState(false)

  // Cargar items de colecciones enviadas (para incluirlas en "lo seleccionado").
  const submittedColls = useMemo(
    () => collections.filter((c) => c.is_locked || c.submitted_at),
    [collections],
  )

  useEffect(() => {
    if (submittedColls.length === 0) {
      setCollItems({})
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all(
      submittedColls.map(async (c) => {
        try {
          const r = await fetch(`/api/galleries/${galleryId}/collections/${c.id}/items`)
          const d = (await r.json()) as { items?: Array<{ asset_id: string }> }
          return [c.id, (d.items ?? []).map((i) => i.asset_id)] as const
        } catch {
          return [c.id, []] as const
        }
      }),
    ).then((pairs) => {
      if (cancelled) return
      setCollItems(Object.fromEntries(pairs))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [galleryId, submittedColls])

  const report = useMemo(() => {
    if (collItems === null) return null

    const byId = new Map(assets.map((a) => [a.id, a]))

    // 1) Lo que el cliente eligió (ids → nombres normalizados)
    const selectedIds = new Set<string>()
    for (const f of favorites) for (const id of f.assetIds) selectedIds.add(id)
    for (const ids of Object.values(collItems)) for (const id of ids) selectedIds.add(id)

    const selected = [...selectedIds]
      .map((id) => byId.get(id))
      .filter((a): a is Asset => !!a)

    const selectedNames = new Map<string, Asset>()
    for (const a of selected) selectedNames.set(norm(a.original_name), a)

    // 2) Lo entregado por pista
    const hq = assets.filter((a) => a.delivery_track === "high_quality")
    const social = assets.filter((a) => a.delivery_track === "social")
    const hqNames = new Set(hq.map((a) => norm(a.original_name)))
    const socialNames = new Set(social.map((a) => norm(a.original_name)))

    // 3) Cobertura contra Máxima Calidad (la entrega "canónica")
    const missing = [...selectedNames.entries()]
      .filter(([n]) => !hqNames.has(n))
      .map(([, a]) => a)
    const matched = [...selectedNames.entries()]
      .filter(([n]) => hqNames.has(n))
      .map(([, a]) => a)
    const extra = hq.filter((a) => selectedNames.size > 0 && !selectedNames.has(norm(a.original_name)))

    return { selected, hq, social, missing, matched, extra, socialNames }
  }, [assets, favorites, collItems])

  if (loading || report === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const noSelection = report.selected.length === 0
  const noDelivery = report.hq.length === 0 && report.social.length === 0

  return (
    <div className="max-w-4xl space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={<Heart className="h-4 w-4 text-rose-500" />}
          label="Cliente eligió"
          value={report.selected.length}
        />
        <SummaryCard
          icon={<span>💎</span>}
          label="Máxima Calidad"
          value={report.hq.length}
        />
        <SummaryCard icon={<span>📱</span>} label="Redes Sociales" value={report.social.length} />
        <SummaryCard
          icon={
            report.missing.length === 0 && !noSelection ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )
          }
          label="Faltantes"
          value={report.missing.length}
          danger={report.missing.length > 0}
        />
      </div>

      {noSelection && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-8 text-center text-sm text-muted-foreground">
          El cliente aún no envió ninguna selección (ni favoritos ni colecciones).
          {!noDelivery && " Las fotos subidas a entrega se listan abajo."}
        </div>
      )}

      {!noSelection && report.missing.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Sparkles className="h-4 w-4" />
          ¡Todo cubierto! Cada foto que el cliente eligió tiene su versión en Máxima Calidad.
        </div>
      )}

      {/* Faltantes */}
      {report.missing.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">
            ⚠️ Eligió el cliente pero NO están en Máxima Calidad ({report.missing.length})
          </h3>
          <PhotoNameGrid assets={report.missing} tone="danger" socialNames={report.socialNames} />
        </section>
      )}

      {/* Extras */}
      {report.extra.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">
            Subiste de más — están en Máxima Calidad pero el cliente no las eligió ({report.extra.length})
          </h3>
          <p className="mb-2 text-[12px] text-muted-foreground">
            No es un error — quizá fueron regalo o reemplazos. Solo para que lo sepas.
          </p>
          <PhotoNameGrid assets={report.extra} tone="warn" />
        </section>
      )}

      {/* Cobertura OK */}
      {report.matched.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-[13px] font-medium text-foreground">
            ✓ Cubiertas ({report.matched.length})
          </summary>
          <div className="mt-3">
            <PhotoNameGrid assets={report.matched} tone="ok" />
          </div>
        </details>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  value: number
  danger?: boolean
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-3 ${danger ? "border-amber-400/50" : "border-border"}`}
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function PhotoNameGrid({
  assets,
  tone,
  socialNames,
}: {
  assets: Asset[]
  tone: "danger" | "warn" | "ok"
  socialNames?: Set<string>
}) {
  const toneCls =
    tone === "danger"
      ? "border-rose-300/60 bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300"
      : tone === "warn"
        ? "border-amber-300/60 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        : "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
  return (
    <div className="flex flex-wrap gap-1.5">
      {assets.map((a) => (
        <span
          key={a.id}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] ${toneCls}`}
          title={a.original_name}
        >
          {a.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.thumbUrl} alt="" className="h-5 w-5 rounded object-cover" />
          )}
          {a.original_name}
          {socialNames?.has(
            a.original_name
              .replace(/\.[^./\\]+$/, "")
              .normalize("NFD")
              .replace(/\p{Diacritic}/gu, "")
              .toLowerCase()
              .trim(),
          ) && <span title="Sí está en Redes Sociales">📱</span>}
        </span>
      ))}
    </div>
  )
}
