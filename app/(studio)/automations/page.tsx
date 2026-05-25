import Link from "next/link"
import {
  Sparkles,
  Plus,
  CheckCircle2,
  PauseCircle,
  Zap,
  Clock,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getAutomationRules } from "@/server/services/automation.service"
import { formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Automatizaciones" }

const TRIGGER_LABELS: Record<string, string> = {
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

const ACTION_LABELS: Record<string, string> = {
  send_email: "Enviar email",
  create_task: "Crear tarea",
  send_notification: "Enviar notificación",
  update_project_status: "Actualizar status del proyecto",
  add_tag: "Agregar tag",
}

export default async function AutomationsPage() {
  const session = await requireStudioAuth()
  const [rules, unread] = await Promise.all([
    getAutomationRules(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const active = rules.filter((r) => r.is_active).length
  const paused = rules.length - active
  const totalRuns = rules.reduce((acc, r) => acc + r.total_runs, 0)

  return (
    <>
      <AppTopbar
        eyebrow="Workflows"
        title="Automatizaciones"
        description="Reglas que ejecutan acciones automáticas cuando ocurren eventos en tu studio."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/automations/new">
              <Plus className="mr-1 size-4" />
              Nueva regla
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {rules.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label="Activas"
              value={active}
              icon={<CheckCircle2 className="size-4" />}
              tone="positive"
            />
            <Kpi
              label="Pausadas"
              value={paused}
              icon={<PauseCircle className="size-4" />}
              tone="neutral"
            />
            <Kpi
              label="Total ejecuciones"
              value={totalRuns}
              icon={<Zap className="size-4" />}
              tone="neutral"
            />
          </div>
        )}

        {rules.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-12 text-muted-foreground/60" />}
            title="Sin automatizaciones configuradas"
            description="Crea reglas para que el sistema actúe automáticamente: enviar emails de bienvenida, crear tareas tras una venta, etiquetar clientes nuevos, etc."
          >
            <Button asChild>
              <Link href="/automations/new">
                <Plus className="mr-1 size-4" />
                Crear primera regla
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {rules.map((r) => (
              <Link
                key={r.id}
                href={`/automations/${r.id}`}
                className="sf-card group block p-4 transition-colors hover:bg-accent/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">
                        {r.name}
                      </h3>
                      {r.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle2 className="size-2.5" />
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                          <PauseCircle className="size-2.5" />
                          Pausada
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                      <span>
                        <strong className="text-foreground">Trigger:</strong>{" "}
                        {TRIGGER_LABELS[r.trigger_event] ?? r.trigger_event}
                      </span>
                      <span>→</span>
                      <span>
                        <strong className="text-foreground">Acción:</strong>{" "}
                        {ACTION_LABELS[r.action_kind] ?? r.action_kind}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">
                    <p className="tabular-nums">
                      <strong className="text-base text-foreground">
                        {r.total_runs}
                      </strong>{" "}
                      runs
                    </p>
                    {r.last_run_at && (
                      <p className="mt-0.5 flex items-center justify-end gap-1">
                        <Clock className="size-2.5" />
                        {formatDateShort(new Date(r.last_run_at))}
                      </p>
                    )}
                    {r.total_runs > 0 && (
                      <p className="mt-0.5 tabular-nums">
                        {Math.round((r.success_runs / r.total_runs) * 100)}%
                        exitosas
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-input bg-card p-4 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">¿Cómo funciona?</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Cada regla escucha un <strong>evento</strong> del sistema (ej.
              "factura pagada") y ejecuta una <strong>acción</strong> (ej.
              "crear tarea de follow-up").
            </li>
            <li>
              Usa <code className="rounded bg-muted px-1">trigger_filters</code>{" "}
              JSON para condicionar (ej.{" "}
              <code className="rounded bg-muted px-1">{`{"min_amount": 5000}`}</code>{" "}
              para solo facturas grandes).
            </li>
            <li>
              Ver el historial de ejecuciones en el detalle de cada regla.
              Errores se loguean sin bloquear otras reglas.
            </li>
          </ul>
        </div>
      </main>
    </>
  )
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: "positive" | "neutral"
}) {
  const iconClass =
    tone === "positive" ? "text-emerald-500" : "text-muted-foreground"
  return (
    <div className="sf-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
