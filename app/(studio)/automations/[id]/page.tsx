import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getAutomationRuleById } from "@/server/services/automation.service"
import { formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { AutomationActions } from "./automation-actions"

export const metadata: Metadata = { title: "Automatización" }

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

const STATUS_BADGE_CLS: Record<string, string> = {
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  skipped: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
}

export default async function AutomationDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()

  const [rule, unread] = await Promise.all([
    getAutomationRuleById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!rule) notFound()

  const successRate =
    rule.total_runs > 0
      ? Math.round((rule.success_runs / rule.total_runs) * 100)
      : 0

  return (
    <>
      <AppTopbar
        eyebrow="Workflows / Automatizaciones"
        title={rule.name}
        description={rule.description ?? "Sin descripción"}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/automations">
              <ArrowLeft className="mr-1 size-3.5" />
              Lista
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Status banner */}
        <div
          className={
            "flex items-center justify-between rounded-xl border px-4 py-3 text-sm " +
            (rule.is_active
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400")
          }
        >
          <div className="flex items-center gap-2">
            {rule.is_active ? (
              <>
                <CheckCircle2 className="size-4" />
                <span>
                  Activa · escuchando eventos{" "}
                  <code className="rounded bg-emerald-100 px-1 dark:bg-emerald-900">
                    {rule.trigger_event}
                  </code>
                </span>
              </>
            ) : (
              <>
                <XCircle className="size-4" />
                <span>Pausada — sin ejecuciones</span>
              </>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <section className="sf-card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat
            label="Total ejecuciones"
            value={String(rule.total_runs)}
            icon={<Zap className="size-4" />}
          />
          <Stat
            label="Éxito"
            value={`${successRate}%`}
            sub={`${rule.success_runs} OK`}
            icon={<CheckCircle2 className="size-4" />}
          />
          <Stat
            label="Última ejecución"
            value={
              rule.last_run_at
                ? formatDate(new Date(rule.last_run_at))
                : "Nunca"
            }
            icon={<Clock className="size-4" />}
          />
          <Stat
            label="Creada"
            value={formatDate(new Date(rule.created_at))}
            icon={<Sparkles className="size-4" />}
          />
        </section>

        {/* Trigger + Action */}
        <section className="sf-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap className="mr-1 inline size-3.5" />
            Definición
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KV label="Trigger event">
              <span className="font-mono text-xs">
                {TRIGGER_LABELS[rule.trigger_event] ?? rule.trigger_event}
              </span>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {rule.trigger_event}
              </p>
            </KV>
            <KV label="Action kind">
              <span className="text-sm">
                {ACTION_LABELS[rule.action_kind] ?? rule.action_kind}
              </span>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {rule.action_kind}
              </p>
            </KV>
            {Object.keys(rule.trigger_filters ?? {}).length > 0 && (
              <KV label="Filtros del trigger">
                <pre className="mt-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-[10px]">
                  {JSON.stringify(rule.trigger_filters, null, 2)}
                </pre>
              </KV>
            )}
            <KV label="Configuración de la acción">
              <pre className="mt-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-[10px]">
                {JSON.stringify(rule.action_config, null, 2)}
              </pre>
            </KV>
          </div>
        </section>

        {/* Acciones */}
        <AutomationActions
          ruleId={rule.id}
          isActive={rule.is_active}
        />

        {/* Historial de runs */}
        <section className="sf-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Últimas {rule.runs?.length ?? 0} ejecuciones
          </h3>
          {(rule.runs?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin ejecuciones todavía. Cuando el evento se dispare, aparecerá
              aquí con su result y tiempo de ejecución.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rule.runs!.map((run) => (
                <li
                  key={run.id}
                  className="flex items-start justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium " +
                          (STATUS_BADGE_CLS[run.status] ?? STATUS_BADGE_CLS.pending)
                        }
                      >
                        {run.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(run.started_at).toLocaleString("es-DO")}
                      </span>
                      {run.duration_ms != null && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          · {run.duration_ms}ms
                        </span>
                      )}
                    </p>
                    {run.entity_type && run.entity_id && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {run.entity_type}:{run.entity_id.slice(0, 8)}
                      </p>
                    )}
                    {run.error_message && (
                      <p className="mt-1 flex items-start gap-1 text-[10px] text-red-600">
                        <AlertCircle className="mt-0.5 size-3 shrink-0" />
                        {run.error_message}
                      </p>
                    )}
                    {(() => {
                      const result = run.result as Record<string, unknown> | null
                      if (!result || Object.keys(result).length === 0) return null
                      return (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] text-muted-foreground">
                            Ver result
                          </summary>
                          <pre className="mt-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-[10px]">
                            {JSON.stringify(result, null, 2)}
                          </pre>
                        </details>
                      )
                    })()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  )
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function KV({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
