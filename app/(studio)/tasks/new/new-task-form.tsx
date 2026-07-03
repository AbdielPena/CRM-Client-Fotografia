"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import {
  AlertCircle,
  Save,
  Loader2,
  CheckSquare,
  Calendar,
  User,
  Tag as TagIcon,
  Link2,
  Bell,
  Repeat,
} from "lucide-react"

import {
  createTaskAction,
  type TaskActionState,
} from "@/server/actions/task.actions"
import { Button } from "@/components/ui/button"

const initialState: TaskActionState = {}

export function NewTaskForm({
  currentUserId,
  members,
  clients,
  projects,
  prefillEntityType,
  prefillEntityId,
}: {
  currentUserId: string
  members: Array<{
    userId: string
    email: string
    name: string | null
    role: string
  }>
  clients: Array<{ id: string; name: string }>
  projects: Array<{ id: string; name: string }>
  prefillEntityType?: string
  prefillEntityId?: string
}) {
  const [state, action] = useFormState(createTaskAction, initialState)
  const [isRecurring, setIsRecurring] = useState(false)
  const [entityType, setEntityType] = useState<string>(
    prefillEntityType ?? "",
  )

  return (
    <form action={action} className="space-y-5">
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      {/* Título + descripción */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <CheckSquare className="mr-1 inline size-3.5" />
          ¿Qué hay que hacer?
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              required
              defaultValue={state.values?.title}
              placeholder="Ej. Enviar contrato firmado a María"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Descripción
            </label>
            <textarea
              name="description"
              rows={3}
              defaultValue={state.values?.description}
              placeholder="Detalle opcional, links, contexto..."
              className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Asignación + prioridad */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <User className="mr-1 inline size-3.5" />
          Asignación
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Asignar a
            </label>
            <select
              name="assignedToUserId"
              defaultValue={state.values?.assignedToUserId ?? currentUserId}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Sin asignar —</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email}
                  {m.userId === currentUserId && " (yo)"}
                  {` · ${m.role}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Prioridad
            </label>
            <select
              name="priority"
              defaultValue={state.values?.priority ?? "medium"}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
        </div>
        <label className="mt-3 flex items-start gap-3 rounded-lg border border-input bg-background p-3">
          <input
            type="checkbox"
            name="notifyAssignee"
            defaultChecked
            className="mt-0.5 rounded border-input"
          />
          <div>
            <p className="flex items-center gap-1 text-sm font-medium">
              <Bell className="size-3.5" />
              Notificar al asignado
            </p>
            <p className="text-[10px] text-muted-foreground">
              Envía notification in-app cuando se asigne + cuando se acerque
              el due date.
            </p>
          </div>
        </label>
      </section>

      {/* Fecha + reminder */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Calendar className="mr-1 inline size-3.5" />
          Fecha y recordatorio
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Fecha límite
            </label>
            <input
              type="date"
              name="dueDate"
              defaultValue={state.values?.dueDate}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Hora (opcional)
            </label>
            <input
              type="time"
              name="dueTime"
              defaultValue={state.values?.dueTime}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Recordar antes (min)
            </label>
            <select
              name="reminderMinutesBefore"
              defaultValue={state.values?.reminderMinutesBefore ?? ""}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Sin recordatorio</option>
              <option value="15">15 minutos antes</option>
              <option value="30">30 minutos antes</option>
              <option value="60">1 hora antes</option>
              <option value="120">2 horas antes</option>
              <option value="1440">1 día antes</option>
              <option value="2880">2 días antes</option>
            </select>
          </div>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-lg border border-input bg-background p-3">
          <input
            type="checkbox"
            name="isRecurring"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="mt-0.5 rounded border-input"
          />
          <div className="flex-1">
            <p className="flex items-center gap-1 text-sm font-medium">
              <Repeat className="size-3.5" />
              Tarea recurrente
            </p>
            <p className="text-[10px] text-muted-foreground">
              Al completar, crea automáticamente la siguiente iteración.
            </p>
            {isRecurring && (
              <div className="mt-2">
                <label className="mb-1 block text-[10px] font-medium">
                  Repetir cada
                </label>
                <select
                  name="recurringIntervalDays"
                  defaultValue="7"
                  className="block w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  <option value="1">Diario</option>
                  <option value="7">Semanal</option>
                  <option value="14">Quincenal</option>
                  <option value="30">Mensual</option>
                  <option value="90">Trimestral</option>
                </select>
              </div>
            )}
          </div>
        </label>
      </section>

      {/* Vinculación */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Link2 className="mr-1 inline size-3.5" />
          Vincular a entidad (opcional)
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Tipo</label>
            <select
              name="entityType"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Ninguna (personal) —</option>
              <option value="client">Cliente</option>
              <option value="project">Proyecto</option>
              <option value="session">Sesión</option>
              <option value="invoice">Factura</option>
              <option value="booking">Reserva</option>
              <option value="contract">Contrato</option>
              <option value="delivery">Entrega</option>
              <option value="custom">Otro (custom)</option>
            </select>
          </div>
          {entityType === "client" && clients.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Cliente
              </label>
              <select
                name="entityId"
                defaultValue={prefillEntityId}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Selecciona —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(entityType === "project" || entityType === "session") &&
            projects.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                {entityType === "session" ? "Sesión" : "Proyecto"}
              </label>
              <select
                name="entityId"
                defaultValue={prefillEntityId}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Selecciona —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(entityType === "invoice" ||
            entityType === "booking" ||
            entityType === "contract" ||
            entityType === "delivery" ||
            entityType === "custom") && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                UUID del entity (avanzado)
              </label>
              <input
                type="text"
                name="entityId"
                defaultValue={prefillEntityId}
                placeholder="UUID o ID"
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          )}
        </div>
      </section>

      {/* Tags */}
      <section className="sf-card p-5">
        <label className="mb-1.5 block text-xs font-medium">
          <TagIcon className="mr-1 inline size-3.5" />
          Tags (separadas por coma)
        </label>
        <input
          type="text"
          name="tags"
          defaultValue={state.values?.tags}
          placeholder="urgente, cliente_vip, esta_semana"
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
      </section>

      {/* Notas */}
      <section className="sf-card p-5">
        <label className="mb-1.5 block text-xs font-medium">
          Notas (privadas)
        </label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={state.values?.notes}
          placeholder="Notas para ti, aparte de la descripción…"
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
      </section>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <SubmitButton />
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-1 size-4 animate-spin" />
          Creando...
        </>
      ) : (
        <>
          <Save className="mr-1 size-4" />
          Crear tarea
        </>
      )}
    </Button>
  )
}
