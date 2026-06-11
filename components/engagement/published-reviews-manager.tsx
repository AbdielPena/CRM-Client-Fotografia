"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Star, Globe, Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react"
import { toast } from "sonner"

import type { AdminReview } from "@/server/services/engagement-feedback.service"

type DraftReview = {
  id?: string
  stars: number
  comment: string
  displayName: string
  photoUrl: string
  projectTitle: string
  published: boolean
}

const emptyDraft: DraftReview = {
  stars: 5,
  comment: "",
  displayName: "",
  photoUrl: "",
  projectTitle: "",
  published: true,
}

function StarRow({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          disabled={!onChange}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star
            className={`h-4 w-4 ${value >= n ? "fill-amber-400 text-amber-500" : "text-muted-foreground/30"}`}
          />
        </button>
      ))}
    </div>
  )
}

export function PublishedReviewsManager({ reviews: initial }: { reviews: AdminReview[] }) {
  const router = useRouter()
  const [reviews, setReviews] = useState<AdminReview[]>(initial)
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<DraftReview | null>(null)

  const refresh = async () => {
    const r = await fetch("/api/engagement/reviews", { cache: "no-store" })
    if (r.ok) {
      const j = (await r.json()) as { reviews: AdminReview[] }
      setReviews(j.reviews)
    }
  }

  const togglePublish = (rev: AdminReview) =>
    start(async () => {
      const r = await fetch(`/api/engagement/reviews/${rev.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !rev.published }),
      })
      if (r.ok) {
        toast.success(rev.published ? "Reseña ocultada" : "Reseña publicada en la web")
        await refresh()
        router.refresh()
      } else toast.error("Error al actualizar")
    })

  const remove = (rev: AdminReview) =>
    start(async () => {
      if (!confirm(`Eliminar reseña de ${rev.displayName ?? "cliente"}?`)) return
      const r = await fetch(`/api/engagement/reviews/${rev.id}`, { method: "DELETE" })
      if (r.ok) {
        toast.success("Reseña eliminada")
        await refresh()
        router.refresh()
      } else toast.error("Error al eliminar")
    })

  const openEdit = (rev: AdminReview) =>
    setEditing({
      id: rev.id,
      stars: rev.stars ?? 5,
      comment: rev.comment ?? "",
      displayName: rev.displayName ?? "",
      photoUrl: rev.photoUrl ?? "",
      projectTitle: rev.projectTitle ?? "",
      published: rev.published,
    })

  const save = (draft: DraftReview) =>
    start(async () => {
      const payload = {
        stars: draft.stars,
        comment: draft.comment,
        displayName: draft.displayName,
        photoUrl: draft.photoUrl.trim() || null,
        projectTitle: draft.projectTitle.trim() || null,
        published: draft.published,
      }
      const url = draft.id ? `/api/engagement/reviews/${draft.id}` : "/api/engagement/reviews"
      const method = draft.id ? "PATCH" : "POST"
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (r.ok) {
        toast.success(draft.id ? "Reseña actualizada" : "Reseña añadida")
        setEditing(null)
        await refresh()
        router.refresh()
      } else toast.error("Error al guardar")
    })

  const publishedCount = reviews.filter((r) => r.published).length

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Reseñas en abbypixel.com/resenas</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {publishedCount} publicada{publishedCount === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ ...emptyDraft })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="h-3.5 w-3.5" /> Añadir manual
        </button>
      </div>

      {reviews.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-[12.5px] text-muted-foreground">
          Aún no hay reseñas. Cuando un cliente califique con 4★ o más + un comentario, aparecerá aquí
          y en la web automáticamente.
        </div>
      )}

      <div className="space-y-2">
        {reviews.map((r) => (
          <div
            key={r.id}
            className={`flex items-start gap-3 rounded-xl border bg-card p-3 ${r.published ? "border-emerald-500/30" : "border-border"}`}
          >
            {r.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.photoUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-lg bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StarRow value={r.stars ?? 0} />
                <p className="truncate text-[12.5px] font-medium text-foreground">
                  {r.displayName ?? "Cliente"}
                </p>
                {r.createdVia === "manual" && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    manual
                  </span>
                )}
              </div>
              {r.projectTitle && (
                <p className="text-[11px] text-muted-foreground/80">{r.projectTitle}</p>
              )}
              {r.comment && (
                <p className="mt-1 line-clamp-3 text-[12px] text-muted-foreground">{r.comment}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => togglePublish(r)}
                disabled={pending}
                title={r.published ? "Quitar de la web" : "Publicar en la web"}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                  r.published
                    ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "border-border bg-background text-muted-foreground hover:border-border-strong"
                }`}
              >
                {r.published ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {r.published ? "En web" : "Oculta"}
              </button>
              <button
                type="button"
                onClick={() => openEdit(r)}
                className="rounded-lg border border-border bg-background p-1 text-muted-foreground hover:border-border-strong"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(r)}
                disabled={pending}
                className="rounded-lg border border-border bg-background p-1 text-rose-500 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditModal
          draft={editing}
          onCancel={() => setEditing(null)}
          onSave={save}
          pending={pending}
        />
      )}
    </section>
  )
}

function EditModal({
  draft,
  onCancel,
  onSave,
  pending,
}: {
  draft: DraftReview
  onCancel: () => void
  onSave: (d: DraftReview) => void
  pending: boolean
}) {
  const [d, setD] = useState<DraftReview>(draft)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {d.id ? "Editar reseña" : "Añadir reseña manual"}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">Estrellas</label>
            <StarRow value={d.stars} onChange={(n) => setD({ ...d, stars: n })} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">
              Nombre (público) — ej. María G.
            </label>
            <input
              value={d.displayName}
              onChange={(e) => setD({ ...d, displayName: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">
              Comentario
            </label>
            <textarea
              value={d.comment}
              onChange={(e) => setD({ ...d, comment: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">
              Foto (URL)
            </label>
            <input
              value={d.photoUrl}
              onChange={(e) => setD({ ...d, photoUrl: e.target.value })}
              placeholder="https://abbypixel.com/assets/images/..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">
              Proyecto (opcional)
            </label>
            <input
              value={d.projectTitle}
              onChange={(e) => setD({ ...d, projectTitle: e.target.value })}
              placeholder="Quinceañera de María"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-foreground">
            <input
              type="checkbox"
              checked={d.published}
              onChange={(e) => setD({ ...d, published: e.target.checked })}
            />
            Publicar en abbypixel.com/resenas
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-[12.5px] text-muted-foreground hover:border-border-strong"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(d)}
            disabled={pending || !d.displayName.trim() || !d.comment.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
