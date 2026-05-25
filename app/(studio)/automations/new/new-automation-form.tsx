"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import {
  AlertCircle,
  Save,
  Loader2,
  Zap,
  Sparkles,
} from "lucide-react"

import {
  createAutomationAction,
  type AutomationActionState,
} from "@/server/actions/automation.actions"
import { triggerEvents, actionKinds } from "@/lib/validations/automation.schema"
import { Button } from "@/components/ui/button"

const initialState: AutomationActionState = {}

const TRIGGER_LABELS: Record<(typeof triggerEvents)[number], string> = {
  "client.created": "Cliente creado",
  "project.created": "Proyecto creado",
  "project.status_changed": "Cambio de estado de proyecto",
  "invoice.sent": "Factura enviada",
  "invoice.paid": "Factura pagada",
  "booking.received": "Reserva recibida",
  "inv_loan.created": "Préstamo creado",
  "inv_loan.returned": "Préstamo devuelto",
  "inv_rental.completed": "Renta completada",
  "gallery.published": "Galería publicada",
  "contract.signed": "Contrato firmado",
}

const ACTION_LABELS: Record<(typeof actionKinds)[number], string> = {
  send_email: "Enviar email (template)",
  create_task: "Crear tarea",
  send_notification: "Enviar notificación interna",
  update_project_status: "Actualizar status del proyecto",
  add_tag: "Agregar tag al entity",
}

const ACTION_CONFIG_TEMPLATES: Record<(typeof actionKinds)[number], string> = {
  send_email: JSON.stringify(
    { template_slug: "welcome", delay_minutes: 0 },
    null,
    2,
  ),
  create_task: JSON.stringify(
    {
      title: "Follow-up con el cliente",
      description: "Enviar correo de seguimiento",
      due_offset_days: 1,
      priority: "medium",
    },
    null,
    2,
  ),
  send_notification: JSON.stringify(
    {
      title: "Evento detectado",
      body: "El evento se disparó",
      severity: "info",
    },
    null,
    2,
  ),
  update_project_status: JSON.stringify({ intent: "edicion" }, null, 2),
  add_tag: JSON.stringify({ tag_name: "vip", tag_color: "#7C3AED" }, null, 2),
}

export function NewAutomationForm() {
  const [state, action] = useFormState(
    createAutomationAction,
    initialState,
  )
  const [actionKind, setActionKind] = useState<(typeof actionKinds)[number]>(
    "send_notification",
  )

  return (
    <form action={action} className="space-y-5">
      {state.ok === false && state.message && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{state.message}</p>
            {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-[11px]">
                {Object.entries(state.fieldErrors).map(([f, errs]) => (
                  <li key={f}>
                    <code>{f}</code>: {errs?.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Nombre + descripción */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="mr-1 inline size-3.5" />
          Información básica
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              defaultValue={state.values?.name}
              placeholder="Ej. Welcome a clientes nuevos"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Descripción
            </label>
            <textarea
              name="description"
              rows={2}
              defaultValue={state.values?.description}
              placeholder="Qué hace esta automatización"
              className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-input bg-background p-3">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked
              className="mt-0.5 rounded border-input"
            />
            <div>
              <p className="text-sm font-medium">Activar al crear</p>
              <p className="text-xs text-muted-foreground">
                Si está activado, la regla escucha eventos desde el momento que
                la creas. Si no, queda pausada hasta que la actives.
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* Trigger */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Zap className="mr-1 inline size-3.5" />
          Trigger (Evento)
        </h3>
        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Cuándo se dispara <span className="text-red-500">*</span>
          </label>
          <select
            name="triggerEvent"
            required
            defaultValue={state.values?.triggerEvent ?? "invoice.paid"}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            {triggerEvents.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]} ({t})
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium">
            Filtros opcionales (JSON)
          </label>
          <textarea
            name="triggerFiltersJson"
            rows={3}
            defaultValue={state.values?.triggerFiltersJson}
            placeholder='Ej: {"event_type": "boda"} o {"min_amount": 5000}'
            className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Vacío = matchea cualquier evento del tipo seleccionado. Si pones
            JSON, todos los keys deben matchear el payload del evento.
          </p>
        </div>
      </section>

      {/* Action */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="mr-1 inline size-3.5" />
          Acción
        </h3>
        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Qué ejecutar <span className="text-red-500">*</span>
          </label>
          <select
            name="actionKind"
            required
            value={actionKind}
            onChange={(e) =>
              setActionKind(e.target.value as (typeof actionKinds)[number])
            }
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            {actionKinds.map((k) => (
              <option key={k} value={k}>
                {ACTION_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium">
            Configuración (JSON) <span className="text-red-500">*</span>
          </label>
          <textarea
            name="actionConfigJson"
            required
            rows={8}
            key={actionKind /* fuerza re-render al cambiar kind */}
            defaultValue={
              state.values?.actionConfigJson ??
              ACTION_CONFIG_TEMPLATES[actionKind]
            }
            className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Se cargó una plantilla por defecto según el tipo de acción.
            Personalízala según necesites. Ver docs/automation-events.md para
            ejemplos completos.
          </p>
        </div>
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
          Crear regla
        </>
      )}
    </Button>
  )
}
