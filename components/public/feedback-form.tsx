"use client"

import { useState } from "react"
import { Star, Loader2 } from "lucide-react"

export function FeedbackForm({
  token,
  minStars,
  hasReviewUrl,
}: {
  token: string
  minStars: number
  hasReviewUrl: boolean
}) {
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")
  const [phase, setPhase] = useState<"rate" | "comment" | "sending" | "done" | "redirecting">("rate")

  const post = async (s: number, c: string | null) => {
    const res = await fetch(`/api/feedback/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars: s, comment: c }),
    })
    return (await res.json()) as { redirectUrl?: string | null; goPublic?: boolean }
  }

  const pickStar = async (s: number) => {
    setStars(s)
    if (s >= minStars && hasReviewUrl) {
      // Feliz → enviar y redirigir a la reseña pública.
      setPhase("sending")
      try {
        const r = await post(s, null)
        if (r.redirectUrl) {
          setPhase("redirecting")
          setTimeout(() => {
            window.location.href = r.redirectUrl as string
          }, 1400)
          return
        }
      } catch {
        /* noop */
      }
      setPhase("done")
    } else {
      // Menos feliz → pedir comentario interno.
      setPhase("comment")
    }
  }

  const sendComment = async () => {
    setPhase("sending")
    try {
      await post(stars, comment.trim() || null)
    } catch {
      /* noop */
    }
    setPhase("done")
  }

  if (phase === "done") {
    return (
      <p className="mt-6 text-[14px] font-medium text-foreground">
        {stars >= minStars ? "¡Gracias por tu valoración! 💛" : "Gracias por tu honestidad. Lo tomamos muy en cuenta. 🙏"}
      </p>
    )
  }

  if (phase === "redirecting") {
    return (
      <div className="mt-6 flex flex-col items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-gold-600" />
        <p className="text-[14px] text-muted-foreground">¡Gracias! Te llevamos a dejar tu reseña ⭐</p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (hover || stars) >= n
          return (
            <button
              key={n}
              type="button"
              disabled={phase === "sending"}
              onClick={() => pickStar(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-1 transition-transform hover:scale-110 disabled:opacity-50"
              aria-label={`${n} estrellas`}
            >
              <Star
                className={`h-9 w-9 transition-colors ${
                  active ? "fill-gold-400 text-gold-500" : "text-black/15"
                }`}
              />
            </button>
          )
        })}
      </div>

      {phase === "sending" && (
        <div className="mt-5 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
        </div>
      )}

      {phase === "comment" && (
        <div className="mt-5 text-left">
          <label className="mb-1.5 block text-[13px] font-medium text-foreground">
            ¿Qué podemos mejorar?
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            placeholder="Cuéntanos con confianza…"
            className="w-full rounded-xl border border-gold-200/60 bg-white/70 px-3 py-2 text-[14px] text-foreground focus:border-gold-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={sendComment}
            className="lx-btn-gold mt-3 w-full"
          >
            Enviar
          </button>
        </div>
      )}
    </div>
  )
}
