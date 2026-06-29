"use client"

import { useState } from "react"
import { Plus, Trash2, UserCog } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { COLLABORATOR_TYPES } from "@/lib/constants/collaborators"
import type { CollaboratorRequirement } from "@/lib/collaborators/requirements"

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"

type Row = CollaboratorRequirement

export function CollaboratorRequirementsEditor({
  defaultValue,
}: {
  defaultValue?: CollaboratorRequirement[]
}) {
  const [rows, setRows] = useState<Row[]>(
    defaultValue?.length ? defaultValue.map((r) => ({ ...r })) : [],
  )

  const json = JSON.stringify(
    rows
      .filter((r) => r.type)
      .map((r) => ({
        type: r.type,
        minCount: Math.max(1, Math.floor(Number(r.minCount) || 1)),
        estimatedCost: Math.max(0, Number(r.estimatedCost) || 0),
        costIncludedInPlan: !!r.costIncludedInPlan,
      })),
  )

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number) =>
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  const add = () =>
    setRows((prev) => [
      ...prev,
      {
        type: "maquillista",
        minCount: 1,
        estimatedCost: 0,
        costIncludedInPlan: false,
      },
    ])

  return (
    <div className="mt-1 rounded-xl border border-border/60 bg-muted/20 p-4 sm:col-span-2">
      <input type="hidden" name="collaboratorRequirements" value={json} />

      <div className="mb-1 flex items-center gap-2">
        <UserCog className="h-4 w-4 text-brand" />
        <p className="text-sm font-semibold text-foreground">
          Colaboradores requeridos
        </p>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Si este plan necesita maquillista, asistente, etc., agrégalos aquí. El
        proyecto avisará si falta asignar alguno.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-3 text-center text-xs text-muted-foreground">
          Este plan no requiere colaboradores.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-2.5"
            >
              <div className="min-w-[140px] flex-1">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Tipo
                </label>
                <select
                  value={r.type}
                  onChange={(e) => update(i, { type: e.target.value })}
                  className={inputCls}
                >
                  {COLLABORATOR_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-20">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Cantidad
                </label>
                <input
                  type="number"
                  min={1}
                  value={r.minCount}
                  onChange={(e) =>
                    update(i, { minCount: Number(e.target.value) })
                  }
                  className={cn(inputCls, "text-center tabular-nums")}
                />
              </div>
              <div className="w-28">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Tarifa est.
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={r.estimatedCost}
                  onChange={(e) =>
                    update(i, { estimatedCost: Number(e.target.value) })
                  }
                  className={cn(inputCls, "tabular-nums")}
                />
              </div>
              <label className="flex h-9 items-center gap-1.5 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={r.costIncludedInPlan}
                  onChange={(e) =>
                    update(i, { costIncludedInPlan: e.target.checked })
                  }
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Incluido en el plan
              </label>
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                title="Quitar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar requisito
      </button>
    </div>
  )
}
