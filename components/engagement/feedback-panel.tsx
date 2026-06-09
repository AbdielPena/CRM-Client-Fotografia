"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Star, MessageSquareQuote, Settings2, Loader2, Check } from "lucide-react"
import { toast } from "sonner"

import { saveReviewConfigAction } from "@/server/actions/engagement-feedback.actions"

interface Summary {
  count: number
  avg: number
  recent: Array<{ stars: number | null; comment: string | null; platform: string | null; clientName: string; at: string | null }>
}

export function FeedbackPanel({
  summary,
  config,
}: {
  summary: Summary
  config: { googleUrl: string | null; facebookUrl: string | null }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [showCfg, setShowCfg] = useState(false)
  const [google, setGoogle] = useState(config.googleUrl ?? "")
  const [facebook, setFacebook] = useState(config.facebookUrl ?? "")

  const save = () =>
    start(async () => {
      const r = await saveReviewConfigAction(google, facebook)
      if (r.ok) {
        toast.success("URLs de reseña guardadas")
        setShowCfg(false)
        router.refresh()
      } else toast.error(r.message ?? "Error")
    })

  const avgStr = summary.avg ? summary.avg.toFixed(1) : "—"

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Feedback y reseñas</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowCfg((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border-strong"
        >
          <Settings2 className="h-3.5 w-3.5" /> URLs de reseña
          {(config.googleUrl || config.facebookUrl) && <Check className="h-3.5 w-3.5 text-emerald-500" />}
        </button>
      </div>

      {showCfg && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[12px] text-muted-foreground">
            Cuando un cliente califica con 4★ o más, lo enviamos a dejar su reseña pública. Con menos,
            capturamos su comentario en privado.
          </p>
          <label className="mb-1 block text-[12px] font-medium text-foreground">Google Reviews (URL)</label>
          <input
            value={google}
            onChange={(e) => setGoogle(e.target.value)}
            placeholder="https://g.page/r/..."
            className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
          />
          <label className="mb-1 block text-[12px] font-medium text-foreground">Facebook Reviews (URL)</label>
          <input
            value={facebook}
            onChange={(e) => setFacebook(e.target.value)}
            placeholder="https://facebook.com/.../reviews"
            className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Promedio</p>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold text-foreground">
            {avgStr}
            <Star className="h-5 w-5 fill-amber-400 text-amber-500" />
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Valoraciones</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{summary.count}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">A Google/Facebook</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {summary.recent.filter((r) => r.platform === "google" || r.platform === "facebook").length}
          </p>
        </div>
      </div>

      {summary.recent.length > 0 && (
        <div className="space-y-2">
          {summary.recent.map((r, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex shrink-0 items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-3.5 w-3.5 ${(r.stars ?? 0) >= n ? "fill-amber-400 text-amber-500" : "text-muted-foreground/30"}`}
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-foreground">{r.clientName}</p>
                {r.comment && <p className="text-[12px] text-muted-foreground">{r.comment}</p>}
              </div>
              {(r.platform === "google" || r.platform === "facebook") && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {r.platform}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
