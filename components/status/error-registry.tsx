"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Bug } from "lucide-react"
import { toast } from "sonner"
import {
  createErrorAction,
  updateErrorStatusAction,
  updateErrorPriorityAction,
  deleteErrorAction,
} from "@/server/actions/status.actions"

interface StatusError {
  id: string
  title: string
  description: string | null
  module: string | null
  priority: string
  status: string
  createdAt: string
}

const PRIORITIES = [
  { value: "critica", label: "Crítica", cls: "bg-red-100 text-red-700" },
  { value: "alta", label: "Alta", cls: "bg-orange-100 text-orange-700" },
  { value: "media", label: "Media", cls: "bg-amber-100 text-amber-700" },
  { value: "baja", label: "Baja", cls: "bg-muted text-muted-foreground" },
]
const STATUSES = [
  { value: "abierto", label: "Abierto" },
  { value: "en_revision", label: "En revisión" },
  { value: "corregido", label: "Corregido" },
  { value: "validado", label: "Validado" },
]

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"

export function ErrorRegistry({
  errors,
  modules,
}: {
  errors: StatusError[]
  modules: { key: string; label: string }[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [showForm, setShowForm] = useState(false)
  const [, start] = useTransition()

  const submit = (fd: FormData) => {
    start(async () => {
      const r = (await createErrorAction(fd)) as { success?: boolean; error?: string }
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success("Error registrado")
      formRef.current?.reset()
      setShowForm(false)
      router.refresh()
    })
  }

  const setStatus = (id: string, status: string) =>
    start(async () => {
      await updateErrorStatusAction(id, status)
      router.refresh()
    })
  const setPriority = (id: string, priority: string) =>
    start(async () => {
      await updateErrorPriorityAction(id, priority)
      router.refresh()
    })
  const remove = (id: string) =>
    start(async () => {
      await deleteErrorAction(id)
      toast.success("Error eliminado")
      router.refresh()
    })

  return (
    <div className="sf-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Registro de errores ({errors.length})</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo error
        </button>
      </div>

      {showForm && (
        <form
          ref={formRef}
          action={submit}
          className="space-y-3 border-b border-border/60 bg-muted/20 px-5 py-4"
        >
          <input name="title" required placeholder="Título del error" className={inputCls} />
          <textarea name="description" rows={2} placeholder="Descripción" className={inputCls} />
          <div className="grid grid-cols-2 gap-3">
            <select name="module" className={inputCls} defaultValue="">
              <option value="">Módulo afectado…</option>
              {modules.map((m) => (
                <option key={m.key} value={m.label}>
                  {m.label}
                </option>
              ))}
            </select>
            <select name="priority" className={inputCls} defaultValue="media">
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
          >
            Registrar error
          </button>
        </form>
      )}

      {errors.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Sin errores registrados.</div>
      ) : (
        <ul className="divide-y divide-border/40">
          {errors.map((e) => {
            const prio = PRIORITIES.find((p) => p.value === e.priority) ?? PRIORITIES[2]
            return (
              <li key={e.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{e.title}</span>
                      <select
                        value={e.priority}
                        onChange={(ev) => setPriority(e.id, ev.target.value)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${prio.cls}`}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      {e.module && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {e.module}
                        </span>
                      )}
                    </div>
                    {e.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(e.createdAt).toLocaleDateString("es-DO")}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <select
                      value={e.status}
                      onChange={(ev) => setStatus(e.id, ev.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      className="p-1 text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
