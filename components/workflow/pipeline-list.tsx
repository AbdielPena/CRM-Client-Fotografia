"use client"

import * as React from "react"
import { Workflow } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { ClientCard } from "@/lib/workflow/types"
import { WorkflowClientCard } from "./workflow-client-card"

export interface StatusOption {
  label: string
  color: string | null
}

/**
 * Lista de clientes EN CURSO con un único desplegable de estado.
 *
 * El pipeline no se divide solo: es una lista plana ordenada por avance (lo
 * más cerca de terminar arriba), y el estudio decide qué ver con el filtro.
 *
 * Filtra por `projects.status`, que guarda la ETIQUETA de un `project_statuses`
 * — por eso las opciones llegan de la configuración del estudio y no de una
 * lista fija: si el estudio renombra un estado, el desplegable lo sigue.
 */
export function PipelineList({
  cards,
  statuses,
}: {
  cards: ClientCard[]
  statuses: StatusOption[]
}) {
  const [status, setStatus] = React.useState<string>("")

  const visible = status
    ? cards.filter((c) => c.projects.some((p) => p.status === status))
    : cards

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Workflow className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          En curso ({cards.length})
        </h2>
        {status && (
          <span className="text-xs text-muted-foreground">· viendo {visible.length}</span>
        )}

        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Estado:
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={cn(
              "rounded-lg border bg-background px-2.5 py-1.5 text-[12.5px] font-medium text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-brand/30",
              status ? "border-brand/40" : "border-border",
            )}
          >
            <option value="">Todos</option>
            {statuses.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cards.length === 0 ? (
        <div className="sf-card py-8 text-center text-sm text-muted-foreground">
          No hay trabajos en curso. ¡Todo al día!
        </div>
      ) : visible.length === 0 ? (
        <div className="sf-card py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún cliente en curso está en «{status}».
          </p>
          <button
            type="button"
            onClick={() => setStatus("")}
            className="mt-2 text-sm font-medium text-brand hover:underline"
          >
            Ver todos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visible.map((card, i) => (
            <WorkflowClientCard key={card.clientId} card={card} index={i} />
          ))}
        </div>
      )}
    </section>
  )
}
