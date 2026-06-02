"use client"

import { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, BookOpen } from "lucide-react"
import { toast } from "sonner"
import { addKnowledgeAction, deleteKnowledgeAction } from "@/server/actions/ai-assistant.actions"

interface Faq {
  id: string
  kind: string
  question: string | null
  answer: string
}

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"

export function KnowledgeManager({ items }: { items: Faq[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [, start] = useTransition()

  const add = (fd: FormData) =>
    start(async () => {
      const r = (await addKnowledgeAction(fd)) as { success?: boolean; error?: string }
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success("Conocimiento agregado")
      formRef.current?.reset()
      router.refresh()
    })

  const remove = (id: string) =>
    start(async () => {
      await deleteKnowledgeAction(id)
      router.refresh()
    })

  return (
    <div className="sf-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          Conocimiento de la IA ({items.length})
        </h2>
      </div>

      <form ref={formRef} action={add} className="space-y-2 border-b border-border/60 bg-muted/20 px-5 py-4">
        <input name="question" placeholder="Pregunta (opcional). Ej: ¿Hacen sesiones a domicilio?" className={inputCls} />
        <textarea
          name="answer"
          required
          rows={2}
          placeholder="Respuesta / dato que la IA debe saber…"
          className={inputCls}
        />
        <div className="flex items-center gap-2">
          <select name="kind" defaultValue="faq" className={`${inputCls} w-40`}>
            <option value="faq">FAQ</option>
            <option value="politica">Política</option>
            <option value="promo">Promoción</option>
            <option value="nota">Nota</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">
          Aún no has entrenado a la IA. Agrega FAQs, políticas y promos para que responda mejor.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                {f.question && <p className="text-sm font-medium text-foreground">{f.question}</p>}
                <p className="text-xs text-muted-foreground">{f.answer}</p>
                <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {f.kind}
                </span>
              </div>
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="p-1 text-muted-foreground hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
