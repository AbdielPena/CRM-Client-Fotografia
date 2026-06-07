"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  Camera,
  Send,
  Pencil,
  Images,
  Printer,
  PartyPopper,
  Check,
  Loader2,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { formatDateShort } from "@/lib/utils/currency"
import { changeTaskStatusAction } from "@/server/actions/task.actions"
import type {
  ClientCard,
  PipelineStage,
  ProjectPipeline,
  StageKey,
  StageState,
} from "@/lib/workflow/types"

const STAGE_ICON: Record<StageKey, LucideIcon> = {
  session: Camera,
  send_selection: Send,
  editing: Pencil,
  final_gallery: Images,
  send_prints: Printer,
  finalized: PartyPopper,
}

function fmt(d: string | null): string {
  return d ? formatDateShort(new Date(d + "T00:00:00")) : "—"
}

function stageStyles(state: StageState): {
  node: string
  label: string
  line: string
} {
  switch (state) {
    case "done":
      return {
        node: "border-emerald-500 bg-emerald-500 text-white",
        label: "text-foreground",
        line: "bg-emerald-500",
      }
    case "current":
      return {
        node: "border-brand bg-brand text-brand-foreground ring-4 ring-brand/15",
        label: "text-foreground font-semibold",
        line: "bg-border",
      }
    case "overdue":
      return {
        node: "border-red-500 bg-red-500 text-white ring-4 ring-red-500/15",
        label: "text-red-600 font-semibold",
        line: "bg-border",
      }
    default:
      return {
        node: "border-border bg-muted text-muted-foreground/70",
        label: "text-muted-foreground",
        line: "bg-border",
      }
  }
}

function StageRow({
  stage,
  isLast,
  onComplete,
  busy,
}: {
  stage: PipelineStage
  isLast: boolean
  onComplete: (taskId: string) => void
  busy: boolean
}) {
  const Icon = stage.state === "done" ? Check : STAGE_ICON[stage.key]
  const s = stageStyles(stage.state)
  const actionable =
    !!stage.taskId && (stage.state === "current" || stage.state === "overdue")

  return (
    <div className="relative flex gap-3">
      {/* Timeline: nodo + línea vertical */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            s.node,
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        {!isLast && <span className={cn("mt-0.5 w-0.5 flex-1", s.line)} />}
      </div>

      {/* Contenido */}
      <div className={cn("flex flex-1 items-center justify-between gap-2", isLast ? "pb-0" : "pb-4")}>
        <div className="min-w-0">
          <p className={cn("text-[13px] leading-tight", s.label)}>{stage.label}</p>
          {stage.date && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              {stage.state === "overdue" ? "Venció " : ""}
              {fmt(stage.date)}
            </p>
          )}
        </div>

        {actionable ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => stage.taskId && onComplete(stage.taskId)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
              stage.state === "overdue"
                ? "bg-red-500/10 text-red-600 hover:bg-red-500/20"
                : "bg-brand-soft text-brand hover:bg-brand/15",
              "disabled:opacity-50",
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Marcar hecho
          </button>
        ) : stage.state === "done" ? (
          <span className="shrink-0 text-[11px] font-medium text-emerald-600">Hecho</span>
        ) : null}
      </div>
    </div>
  )
}

function ProjectBlock({
  project,
  onComplete,
  busyTaskId,
}: {
  project: ProjectPipeline
  onComplete: (taskId: string) => void
  busyTaskId: string | null
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/projects/${project.projectId}`}
          className="truncate text-[13px] font-semibold text-foreground hover:text-brand"
        >
          {project.projectName}
        </Link>
        {project.estimatedDeliveryDate && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            Entrega {fmt(project.estimatedDeliveryDate)}
          </span>
        )}
      </div>

      <div>
        {project.stages.map((stage, i) => (
          <StageRow
            key={stage.key}
            stage={stage}
            isLast={i === project.stages.length - 1}
            onComplete={onComplete}
            busy={busyTaskId === stage.taskId}
          />
        ))}
      </div>
    </div>
  )
}

export function WorkflowClientCard({
  card,
  index = 0,
}: {
  card: ClientCard
  index?: number
}) {
  const router = useRouter()
  const [busyTaskId, setBusyTaskId] = React.useState<string | null>(null)

  const onComplete = React.useCallback(
    (taskId: string) => {
      setBusyTaskId(taskId)
      ;(async () => {
        const r = await changeTaskStatusAction(taskId, "completada")
        if (r?.ok) {
          toast.success("Etapa completada")
          router.refresh()
        } else {
          toast.error(r?.message ?? "No se pudo completar la etapa")
        }
        setBusyTaskId(null)
      })()
    },
    [router],
  )

  const nextAction = card.projects
    .map((p) => p.nextActionLabel)
    .find((l): l is string => !!l)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3), ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "sf-card overflow-hidden rounded-2xl",
        card.finalized && "opacity-80",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <Link
            href={`/clients/${card.clientId}`}
            className="truncate text-sm font-semibold text-foreground hover:text-brand"
          >
            {card.clientName}
          </Link>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {card.projects.length} {card.projects.length === 1 ? "proyecto" : "proyectos"}
            {card.earliestDelivery && !card.finalized && (
              <> · entrega más próxima {fmt(card.earliestDelivery)}</>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {card.finalized ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Finalizado
            </span>
          ) : nextAction ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">
              {nextAction}
            </span>
          ) : null}
          {card.totalOverdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {card.totalOverdue} atrasada{card.totalOverdue === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {/* Proyectos */}
      <div className="space-y-3 px-5 py-4">
        {card.projects.map((p) => (
          <ProjectBlock
            key={p.projectId}
            project={p}
            onComplete={onComplete}
            busyTaskId={busyTaskId}
          />
        ))}
      </div>
    </motion.div>
  )
}
