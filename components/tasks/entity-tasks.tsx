import Link from "next/link"
import { Plus, CheckSquare } from "lucide-react"

import { getTasks } from "@/server/services/task.service"
import { TaskCard } from "@/components/tasks/task-card"

/**
 * Sección "Tareas" reutilizable dentro del perfil de un cliente/proyecto.
 * Lista las tareas vinculadas a esa entidad (misma fila que en /tasks → al
 * completar aquí queda sincronizado en Tareas y viceversa).
 */
export async function EntityTasks({
  studioId,
  userId,
  entityType,
  entityId,
  title = "Tareas",
}: {
  studioId: string
  userId: string
  entityType: string
  entityId: string
  title?: string
}) {
  const { items } = await getTasks(studioId, { entityType, entityId, pageSize: 50 })
  const today = new Date().toISOString().slice(0, 10)
  const DONE = new Set(["completada", "cancelada"])
  const sorted = [...items].sort(
    (a, b) => (DONE.has(a.status) ? 1 : 0) - (DONE.has(b.status) ? 1 : 0),
  )
  const pending = items.filter((t) => !DONE.has(t.status)).length

  return (
    <section className="sf-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <CheckSquare className="size-4 text-brand" /> {title}
          {pending > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {pending}
            </span>
          )}
        </h3>
        <Link
          href={`/tasks/new?entityType=${entityType}&entityId=${entityId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          <Plus className="size-3.5" /> Nueva tarea
        </Link>
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin tareas. Crea una vinculada con “Nueva tarea”.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              pinnedToday={t.daily_pin_date === today && t.daily_pin_user_id === userId}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
