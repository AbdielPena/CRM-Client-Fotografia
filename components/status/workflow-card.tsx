"use client"

import { useState, useTransition } from "react"
import { ChevronDown, CheckCircle2, FlaskConical } from "lucide-react"
import { toast } from "sonner"
import {
  toggleChecklistItemAction,
  saveWorkflowNotesAction,
  markWorkflowValidatedAction,
} from "@/server/actions/status.actions"

interface ChecklistItem {
  key: string
  label: string
}

interface WorkflowCardProps {
  workflowKey: string
  name: string
  description: string
  modules: string[]
  checklist: ChecklistItem[]
  initialChecked: Record<string, boolean>
  initialNotes: string
  lastValidatedAt: string | null
}

export function WorkflowCard(props: WorkflowCardProps) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>(props.initialChecked)
  const [notes, setNotes] = useState(props.initialNotes)
  const [, start] = useTransition()

  const done = props.checklist.filter((c) => checked[c.key]).length
  const total = props.checklist.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const complete = done === total && total > 0

  const toggle = (itemKey: string, value: boolean) => {
    setChecked((c) => ({ ...c, [itemKey]: value }))
    start(async () => {
      await toggleChecklistItemAction(props.workflowKey, itemKey, value)
    })
  }

  const saveNotes = () => {
    start(async () => {
      await saveWorkflowNotesAction(props.workflowKey, notes)
      toast.success("Notas guardadas")
    })
  }

  const validate = () => {
    start(async () => {
      await markWorkflowValidatedAction(props.workflowKey)
      toast.success("Workflow marcado como validado")
    })
  }

  return (
    <div className="sf-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                complete ? "bg-emerald-500" : done > 0 ? "bg-amber-500" : "bg-muted-foreground/40"
              }`}
            />
            <h3 className="truncate text-sm font-semibold text-foreground">{props.name}</h3>
            {props.lastValidatedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> validado
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{props.description}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            {done}/{total}
          </span>
          <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
            <div
              className={`h-full ${complete ? "bg-emerald-500" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 px-5 py-4 space-y-4">
          {props.modules.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {props.modules.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          <ul className="space-y-1.5">
            {props.checklist.map((item) => (
              <li key={item.key}>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={!!checked[item.key]}
                    onChange={(e) => toggle(item.key, e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                  />
                  <span
                    className={checked[item.key] ? "text-muted-foreground line-through" : "text-foreground"}
                  >
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Observaciones / notas
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Ej. El contrato no aparecía en el proyecto; error en el envío de correo…"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={validate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar validado
            </button>
            <span className="text-[11px] text-muted-foreground">
              <FlaskConical className="mr-1 inline h-3 w-3" />
              {props.lastValidatedAt
                ? `Última validación: ${new Date(props.lastValidatedAt).toLocaleDateString("es-DO")}`
                : "Sin validar todavía"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
