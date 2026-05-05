"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, FolderOpen, Plus, GripVertical } from "lucide-react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"

import { setProjectStatusAction } from "@/server/actions/project-status.actions"
import { cn } from "@/lib/utils/cn"
import { formatDate } from "@/lib/utils/currency"

type Status = {
  id: string
  label: string
  color: string
  position: number
}

export type ProjectCard = {
  id: string
  name: string
  status: string
  event_type: string | null
  event_date: string | null
  client: { name: string } | { name: string }[] | null
}

interface ProjectKanbanViewProps {
  projects: ProjectCard[]
  statuses: Status[]
}

const TYPE_LABELS: Record<string, string> = {
  wedding: "Boda",
  portrait: "Retrato",
  family: "Familia",
  corporate: "Corporativo",
  quinceañera: "Quinceañera",
  newborn: "Recién nacido",
  event: "Evento",
  other: "Otro",
}

function getClientName(c: ProjectCard["client"]): string {
  if (!c) return "—"
  if (Array.isArray(c)) return c[0]?.name ?? "—"
  return c.name ?? "—"
}

export function ProjectKanbanView({
  projects: initialProjects,
  statuses,
}: ProjectKanbanViewProps) {
  const [projects, setProjects] = React.useState(initialProjects)
  const [activeId, setActiveId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setProjects(initialProjects)
  }, [initialProjects])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  // Mapea un status crudo (potencialmente legacy: "booked", "in_progress", etc.)
  // al label del studio que mejor le corresponda.
  // Si nada matchea, lo deja en el primer status del studio.
  const resolveStatus = React.useCallback(
    (raw: string): string => {
      // Match exacto primero
      if (statuses.some((s) => s.label === raw)) return raw

      const r = raw.toLowerCase().replace(/[_\s-]+/g, "")
      const keyMap: Array<[RegExp, string[]]> = [
        [/inquiry|consulta/, ["consulta", "inquiry", "lead"]],
        [/booked|reservad/, ["reserv", "booked", "agendad", "confirm"]],
        [/inprogress|sesion|enprogreso/, ["sesion", "progres", "shoot", "captur"]],
        [/editing|editand|enedicion/, ["edici", "edit", "post", "produc"]],
        [/delivered|entregad/, ["entreg", "delivered", "final"]],
        [/archived|archivad/, ["archiv", "cerrad", "cancel"]],
      ]

      for (const [legacyRx, kw] of keyMap) {
        if (!legacyRx.test(r)) continue
        const found = statuses.find((s) => {
          const lbl = s.label.toLowerCase().replace(/[_\s-]+/g, "")
          return kw.some((k) => lbl.includes(k))
        })
        if (found) return found.label
      }

      // Último fallback: primer status del studio
      return statuses[0]?.label ?? raw
    },
    [statuses],
  )

  const grouped = React.useMemo(() => {
    const map: Record<string, ProjectCard[]> = {}
    for (const s of statuses) map[s.label] = []
    for (const p of projects) {
      const key = resolveStatus(p.status)
      if (!map[key]) map[key] = []
      map[key]!.push(p)
    }
    return map
  }, [projects, statuses, resolveStatus])

  const activeProject = activeId
    ? projects.find((p) => p.id === activeId) ?? null
    : null

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return

    const projectId = String(active.id)
    const newStatus = String(over.id)
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    // Si el proyecto ya estaba en esa columna (con status crudo igual), skip.
    if (project.status === newStatus) return

    const previousStatus = project.status

    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p)),
    )

    const res = await setProjectStatusAction(projectId, newStatus)
    if (res.error) {
      toast.error(`No se pudo cambiar: ${res.error}`)
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, status: previousStatus } : p,
        ),
      )
    } else {
      toast.success(`Movido a "${newStatus}"`)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-4 overflow-x-auto pb-4"
        style={{ minHeight: 540 }}
      >
        {statuses.map((stage, i) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            projects={grouped[stage.label] ?? []}
            index={i}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeProject ? (
          <div className="rotate-2 cursor-grabbing">
            <ProjectCardView project={activeProject} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({
  stage,
  projects,
  index,
}: {
  stage: Status
  projects: ProjectCard[]
  index: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.label })

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: [0.32, 0.72, 0, 1],
        delay: index * 0.04,
      }}
      className={cn(
        "flex w-[300px] flex-shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors",
        isOver ? "border-brand bg-brand-soft/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="truncate text-[13px] font-semibold text-foreground">
            {stage.label}
          </h3>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {projects.length}
          </span>
        </div>
      </div>

      <div ref={setNodeRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {projects.length === 0 ? (
            <div
              className={cn(
                "flex h-24 items-center justify-center rounded-lg border-2 border-dashed text-[12px] text-muted-foreground",
                isOver ? "border-brand text-brand" : "border-border/60",
              )}
            >
              {isOver ? "Soltá aquí" : "Sin proyectos"}
            </div>
          ) : (
            projects.map((p) => <DraggableCard key={p.id} project={p} />)
          )}
        </AnimatePresence>
      </div>

      <div className="px-3 pb-3">
        <Link
          href={`/projects/new?status=${encodeURIComponent(stage.label)}`}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-2 text-[12px] font-medium text-muted-foreground",
            "transition-colors duration-fast hover:border-brand/40 hover:bg-background hover:text-brand",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo proyecto
        </Link>
      </div>
    </motion.div>
  )
}

function DraggableCard({ project }: { project: ProjectCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: project.id,
  })

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      {...attributes}
      {...listeners}
      className="group cursor-grab touch-none active:cursor-grabbing"
    >
      <ProjectCardView project={project} />
    </motion.div>
  )
}

function ProjectCardView({
  project,
  dragging = false,
}: {
  project: ProjectCard
  dragging?: boolean
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-border bg-card p-3 transition-shadow",
        dragging ? "shadow-lg" : "shadow-xs hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
          <FolderOpen className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
            {project.name}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {getClientName(project.client)}
          </p>
        </div>
        <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
      </div>

      {(project.event_type || project.event_date) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          {project.event_type && (
            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium capitalize text-muted-foreground">
              {TYPE_LABELS[project.event_type] ?? project.event_type}
            </span>
          )}
          {project.event_date && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(new Date(project.event_date))}
            </span>
          )}
        </div>
      )}

      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        aria-label={`Abrir ${project.name}`}
      />
    </div>
  )
}
