"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  Trash2,
} from "lucide-react"

import {
  deleteTemplateAction,
  upsertTemplateAction,
} from "@/server/actions/project-template.actions"
import type {
  ProjectTemplate,
  TemplateConfig,
} from "@/server/services/project-template.service"
import { Button } from "@/components/ui/button"

const DEFAULT_CONFIG: TemplateConfig = {
  tasks: [
    {
      title: "Confirmar fecha + lugar",
      due_offset_days: -60,
      priority: "high",
    },
    {
      title: "Enviar contrato firmado",
      due_offset_days: -45,
      priority: "high",
    },
    {
      title: "Recibir depósito",
      due_offset_days: -30,
      priority: "urgent",
    },
    {
      title: "Reunión pre-sesión",
      due_offset_days: -7,
      priority: "medium",
    },
    {
      title: "Día del evento",
      due_offset_days: 0,
      priority: "urgent",
    },
    {
      title: "Iniciar edición",
      due_offset_days: 2,
      priority: "high",
    },
    {
      title: "Entregar preview cliente",
      due_offset_days: 14,
      priority: "medium",
    },
    {
      title: "Entrega final + cobro saldo",
      due_offset_days: 30,
      priority: "urgent",
    },
  ],
  email_triggers: [
    {
      event: "booked",
      template_slug: "welcome",
    },
    {
      event: "week_before",
      template_slug: "reminder_session",
    },
    {
      event: "after_session",
      template_slug: "thanks_preview",
    },
  ],
  deliverables: [
    {
      name: "Galería preview",
      due_offset_days: 14,
      type: "gallery",
    },
    {
      name: "Galería final",
      due_offset_days: 30,
      type: "gallery",
    },
  ],
  pricing: {
    base_amount: 0,
    deposit_amount: 0,
    currency: "DOP",
  },
}

export function TemplateForm({
  template,
}: {
  template: ProjectTemplate | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)
  const [configJson, setConfigJson] = useState<string>(() =>
    JSON.stringify(template?.config ?? DEFAULT_CONFIG, null, 2),
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("configJson", configJson)
    if (template?.id) formData.set("id", template.id)

    startTransition(async () => {
      const res = await upsertTemplateAction(formData)
      if (res.ok) {
        setFeedback({ type: "ok", msg: "Plantilla guardada" })
        if (!template && res.templateId) {
          setTimeout(
            () =>
              router.push(
                `/settings/project-templates/${res.templateId}`,
              ),
            500,
          )
        } else {
          router.refresh()
        }
      } else {
        setFeedback({ type: "err", msg: res.message ?? "Error" })
      }
    })
  }

  async function handleDelete() {
    if (!template) return
    if (!window.confirm("¿Eliminar esta plantilla?")) return

    startTransition(async () => {
      const res = await deleteTemplateAction(template.id)
      if (res.ok) {
        router.push("/settings/project-templates")
      } else {
        setFeedback({ type: "err", msg: res.message ?? "Error" })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {feedback && (
        <div
          className={
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm " +
            (feedback.type === "ok"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")
          }
        >
          {feedback.type === "ok" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          {feedback.msg}
        </div>
      )}

      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Información básica
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              defaultValue={template?.name ?? ""}
              placeholder="Boda completa"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Tipo de evento
            </label>
            <input
              type="text"
              name="eventType"
              defaultValue={template?.event_type ?? ""}
              placeholder="boda, quince, sesion, corporativo..."
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium">
              Descripción
            </label>
            <textarea
              name="description"
              rows={2}
              defaultValue={template?.description ?? ""}
              placeholder="Para que sirve esta plantilla, a quién va dirigida..."
              className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Duración default (días post-evento)
            </label>
            <input
              type="number"
              name="defaultDurationDays"
              defaultValue={template?.default_duration_days ?? ""}
              placeholder="30"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Moneda default
            </label>
            <select
              name="defaultCurrency"
              defaultValue={template?.default_currency ?? "DOP"}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="DOP">DOP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium">
              Imagen de portada (URL)
            </label>
            <input
              type="url"
              name="coverImageUrl"
              defaultValue={template?.cover_image_url ?? ""}
              placeholder="https://cdn.tudominio.com/cover-boda.jpg"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <label className="mt-3 flex items-start gap-3">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={template?.is_active ?? true}
            className="mt-0.5 rounded border-input"
          />
          <div>
            <p className="text-sm font-medium">Activa</p>
            <p className="text-[10px] text-muted-foreground">
              Si desactivas, no aparece al crear proyectos pero conserva los
              proyectos ya creados.
            </p>
          </div>
        </label>
      </section>

      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Configuración (JSON editable)
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Define las tasks, emails, deliverables, packages y pricing default.
          Los <code>due_offset_days</code> son relativos al event_date
          (negativo = antes, positivo = después).
        </p>
        <textarea
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          rows={28}
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
        />
      </section>

      <div className="flex items-center justify-between border-t border-border pt-4">
        {template && (
          <Button
            type="button"
            onClick={handleDelete}
            variant="outline"
            size="sm"
            disabled={isPending}
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <Trash2 className="mr-1 size-3.5" />
            Eliminar
          </Button>
        )}
        <div className="ml-auto">
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-1 size-4" />
                {template ? "Guardar cambios" : "Crear plantilla"}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
