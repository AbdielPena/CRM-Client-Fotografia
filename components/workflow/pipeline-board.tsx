"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, CalendarDays, Check, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { formatDateShort } from "@/lib/utils/currency"
import { changeTaskStatusAction } from "@/server/actions/task.actions"
import {
  STAGE_LABELS,
  STAGE_ORDER,
  type ClientCard,
  type StageKey,
} from "@/lib/workflow/types"

/**
 * Pipeline en columnas: cada sesión aparece UNA vez, en la etapa donde está.
 *
 * La vista anterior mostraba, por cada cliente, las seis etapas con su check —
 * o sea seis líneas por tarjeta aunque cinco ya estuvieran hechas. Con 46
 * clientes eso es mucho ruido para responder la única pregunta que importa:
 * *¿qué me toca ahora y de quién?*
 *
 * Aquí la posición ya dice en qué etapa está, así que la tarjeta se queda con
 * lo mínimo: cliente, sesión, fecha de entrega y el aviso de atraso.
 */

export interface StatusOption {
  label: string
  color: string | null
}

/** Color por etapa. Sobrio: solo tiñe el encabezado, no las tarjetas. */
const STAGE_COLOR: Record<StageKey, string> = {
  session: "#8b7bd8",
  send_selection: "#4a9fd8",
  editing: "#d8a44a",
  final_gallery: "#3fae7a",
  send_prints: "#d87b6b",
  finalized: "#8a8a8a",
}

interface Tarjeta {
  clientId: string
  clientName: string
  projectId: string
  projectName: string
  deliveryDate: string | null
  overdue: boolean
  /** Tarea de la etapa actual, si la hay: permite marcarla hecha desde aquí. */
  taskId: string | null
  stage: StageKey
}

/**
 * Cuánto falta para la entrega, en texto corto.
 *
 * La fecha sola no dice nada de un vistazo: "5 sep" hay que restarlo mentalmente
 * en cada tarjeta. El "en 3 d" es lo que de verdad se lee.
 *
 * Mediodía a propósito: con `new Date("2026-09-05")` la fecha se interpreta en
 * UTC y en RD retrocede un día.
 */
function plazoDe(fecha: string | null): { texto: string; urgente: boolean } {
  if (!fecha) return { texto: "", urgente: false }
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  const dias = Math.round(
    (new Date(`${fecha}T12:00:00`).getTime() - hoy.getTime()) / 86400000,
  )
  if (dias < 0) return { texto: `hace ${-dias} d`, urgente: true }
  if (dias === 0) return { texto: "hoy", urgente: true }
  if (dias === 1) return { texto: "mañana", urgente: true }
  return { texto: `en ${dias} d`, urgente: dias <= 3 }
}

/** La etapa donde está la sesión: la actual o atrasada; si no, la última hecha. */
function etapaDe(stages: ClientCard["projects"][number]["stages"]): {
  key: StageKey
  overdue: boolean
  taskId: string | null
} {
  const actual = stages.find((s) => s.state === "current" || s.state === "overdue")
  if (actual) {
    return {
      key: actual.key,
      overdue: actual.state === "overdue",
      taskId: actual.taskId,
    }
  }
  // Sin etapa activa: se coloca en la última completada (normalmente
  // "finalizado"), para que ninguna sesión se caiga del tablero.
  const hechas = stages.filter((s) => s.state === "done")
  const ultima = hechas[hechas.length - 1]
  return { key: ultima?.key ?? "session", overdue: false, taskId: null }
}

export function PipelineBoard({
  cards,
  statuses,
}: {
  cards: ClientCard[]
  statuses: StatusOption[]
}) {
  const router = useRouter()
  const [status, setStatus] = React.useState("")
  const [marcando, setMarcando] = React.useState<string | null>(null)

  const tarjetas = React.useMemo<Tarjeta[]>(() => {
    const out: Tarjeta[] = []
    for (const c of cards) {
      for (const p of c.projects) {
        if (status && p.status !== status) continue
        const e = etapaDe(p.stages)
        out.push({
          clientId: c.clientId,
          clientName: c.clientName,
          projectId: p.projectId,
          projectName: p.projectName,
          deliveryDate: p.estimatedDeliveryDate,
          overdue: e.overdue,
          taskId: e.taskId,
          stage: e.key,
        })
      }
    }
    return out
  }, [cards, status])

  const porEtapa = React.useMemo(() => {
    const m = new Map<StageKey, Tarjeta[]>()
    for (const k of STAGE_ORDER) m.set(k, [])
    for (const t of tarjetas) m.get(t.stage)?.push(t)
    // Orden dentro de la columna: por FECHA DE ENTREGA, la más próxima arriba.
    // Lo atrasado sube solo, porque su fecha ya pasó. Las sin fecha, al final.
    for (const lista of m.values()) {
      lista.sort((a, b) =>
        (a.deliveryDate ?? "9999-12-31").localeCompare(b.deliveryDate ?? "9999-12-31"),
      )
    }
    return m
  }, [tarjetas])

  async function marcarHecho(taskId: string) {
    setMarcando(taskId)
    try {
      // La acción devuelve { ok, message } — no { error }.
      const r = await changeTaskStatusAction(taskId, "completada")
      if (!r?.ok) {
        toast.error(r?.message ?? "No se pudo completar la etapa")
        return
      }
      toast.success("Etapa completada")
      router.refresh()
    } finally {
      setMarcando(null)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          En curso ({tarjetas.length})
        </h2>
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

      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGE_ORDER.map((key) => {
          const lista = porEtapa.get(key) ?? []
          const color = STAGE_COLOR[key]
          const atrasadas = lista.filter((t) => t.overdue).length
          return (
            <div
              key={key}
              className="flex w-[266px] flex-shrink-0 flex-col rounded-xl border border-border/70 bg-muted/25"
            >
              <header
                className="flex items-center gap-2 rounded-t-xl border-b border-border/70 px-3 py-2.5"
                style={{ boxShadow: `inset 0 2px 0 0 ${color}` }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <h3 className="truncate text-[12.5px] font-semibold text-foreground">
                  {STAGE_LABELS[key]}
                </h3>
                <span className="ml-auto shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
                  {lista.length}
                </span>
                {atrasadas > 0 ? (
                  <span className="shrink-0 rounded-full bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                    {atrasadas}
                  </span>
                ) : null}
              </header>

              <div className="flex flex-col gap-2 p-2">
                {lista.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[11.5px] text-muted-foreground/70">
                    Vacío
                  </p>
                ) : (
                  lista.map((t) => (
                    <TarjetaSesion
                      key={t.projectId}
                      t={t}
                      ocupado={marcando === t.taskId}
                      onHecho={marcarHecho}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TarjetaSesion({
  t,
  ocupado,
  onHecho,
}: {
  t: Tarjeta
  ocupado: boolean
  onHecho: (taskId: string) => void
}) {
  const plazo = plazoDe(t.deliveryDate)
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-2.5 py-2 transition-colors",
        t.overdue ? "border-red-500/40" : "border-border/70 hover:border-border",
      )}
    >
      <Link
        href={`/projects/${t.projectId}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <p className="truncate text-[13px] font-semibold text-foreground">
          {t.clientName}
        </p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {t.projectName}
        </p>
      </Link>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {t.deliveryDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
              plazo.urgente
                ? "bg-red-500/12 text-red-600 dark:text-red-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            <CalendarDays className="h-3 w-3 shrink-0" />
            Entrega {formatDateShort(new Date(`${t.deliveryDate}T12:00:00`))}
            <span className="opacity-70">· {plazo.texto}</span>
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/70">
            Sin fecha de entrega
          </span>
        )}
        {t.overdue ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Atrasada
          </span>
        ) : null}
      </div>

      {t.taskId ? (
        <button
          type="button"
          onClick={() => onHecho(t.taskId!)}
          disabled={ocupado}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {ocupado ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Marcar hecho
        </button>
      ) : null}
    </div>
  )
}
