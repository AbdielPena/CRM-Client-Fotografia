"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { GraduationCap, Check, X } from "lucide-react"
import { toast } from "sonner"
import { resolveLearningAction, ignoreLearningAction } from "@/server/actions/ai-assistant.actions"

interface Item {
  id: string
  question: string
  context: string | null
  createdAt: string
}

export function LearningPanel({ items }: { items: Item[] }) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [, start] = useTransition()

  const teach = (id: string, question: string) => {
    const answer = (answers[id] ?? "").trim()
    if (!answer) {
      toast.error("Escribe la respuesta para enseñar a la IA")
      return
    }
    start(async () => {
      const r = (await resolveLearningAction(id, question, answer)) as {
        success?: boolean
        error?: string
      }
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success("¡La IA aprendió esta respuesta!")
      router.refresh()
    })
  }

  const ignore = (id: string) =>
    start(async () => {
      await ignoreLearningAction(id)
      router.refresh()
    })

  return (
    <div className="sf-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
        <GraduationCap className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">
          Aprendizaje de la IA ({items.length})
        </h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Preguntas que no supo responder
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">
          Nada pendiente. Cuando la IA no sepa algo (y el modo aprendizaje esté activo), la
          pregunta aparecerá aquí para que la contestes.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((it) => (
            <li key={it.id} className="px-5 py-4">
              <p className="text-sm font-medium text-foreground">“{it.question}”</p>
              {it.context && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">Contexto: {it.context}</p>
              )}
              <div className="mt-2 flex items-start gap-2">
                <textarea
                  value={answers[it.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [it.id]: e.target.value }))}
                  rows={2}
                  placeholder="Tu respuesta (la IA la usará desde ahora)…"
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => teach(it.id, it.question)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" /> Enseñar
                  </button>
                  <button
                    type="button"
                    onClick={() => ignore(it.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" /> Ignorar
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-amber-600">
                ⚠️ No pongas precios personalizados ni descuentos aquí — eso siempre va a un humano.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
