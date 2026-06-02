import type { Metadata } from "next"
import { Activity, ClipboardList, ListChecks, ShieldCheck, FlaskConical } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getWorkflowStates,
  listErrors,
  listTestRuns,
  getLatestAuditRun,
} from "@/server/services/status.service"
import type { ProbeResult } from "@/server/services/status-audit.service"
import { STATUS_MODULES, STATUS_WORKFLOWS, type ModuleGroup } from "@/lib/status/catalog"
import { AppTopbar } from "@/components/layout/app-topbar"
import { StatusAuditButton } from "@/components/status/status-audit-button"
import { WorkflowCard } from "@/components/status/workflow-card"
import { ErrorRegistry } from "@/components/status/error-registry"

export const metadata: Metadata = { title: "Estado del sistema" }
export const dynamic = "force-dynamic"

type ModuleStatus = "ok" | "warning" | "error" | "unchecked"

const DOT: Record<ModuleStatus, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  unchecked: "bg-muted-foreground/40",
}
const DOT_LABEL: Record<ModuleStatus, string> = {
  ok: "Operativo",
  warning: "Advertencia",
  error: "Error",
  unchecked: "Sin revisar",
}
const GROUP_ORDER: ModuleGroup[] = [
  "Principal",
  "CRM",
  "Documentos",
  "Módulos",
  "Integraciones",
  "Infraestructura",
]

export default async function StatusPage() {
  const session = await requireStudioAuth()
  const [states, errors, testRuns, latestAudit, unread] = await Promise.all([
    getWorkflowStates(session.studioId),
    listErrors(session.studioId),
    listTestRuns(session.studioId, 30),
    getLatestAuditRun(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const probeResults = (latestAudit?.results as ProbeResult[] | undefined) ?? []
  const probeByKey = new Map(probeResults.map((p) => [p.key, p]))

  const moduleStatus = (probeKey?: string): { status: ModuleStatus; msg: string | null } => {
    if (!probeKey) return { status: "unchecked", msg: null }
    const p = probeByKey.get(probeKey)
    return p ? { status: p.status as ModuleStatus, msg: p.message } : { status: "unchecked", msg: null }
  }

  // Métricas de calidad
  const totalWf = STATUS_WORKFLOWS.length
  const validated = STATUS_WORKFLOWS.filter((w) => states[w.key]?.lastValidatedAt).length
  const openErrors = errors.filter((e) => e.status === "abierto" || e.status === "en_revision").length
  const fixedErrors = errors.filter((e) => e.status === "corregido" || e.status === "validado").length
  const modStatuses = STATUS_MODULES.map((m) => moduleStatus(m.probe).status)
  const modOk = modStatuses.filter((s) => s === "ok").length
  const modProblem = modStatuses.filter((s) => s === "warning" || s === "error").length

  const metrics = [
    { label: "Workflows validados", value: `${validated}/${totalWf}`, icon: ListChecks, cls: "text-emerald-600" },
    { label: "Workflows pendientes", value: totalWf - validated, icon: ClipboardList, cls: "text-foreground" },
    { label: "Errores abiertos", value: openErrors, icon: Activity, cls: openErrors > 0 ? "text-red-600" : "text-foreground" },
    { label: "Errores corregidos", value: fixedErrors, icon: ShieldCheck, cls: "text-emerald-600" },
    { label: "Módulos operativos", value: modOk, icon: ShieldCheck, cls: "text-emerald-600" },
    { label: "Módulos con problemas", value: modProblem, icon: Activity, cls: modProblem > 0 ? "text-amber-600" : "text-foreground" },
  ]

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: STATUS_MODULES.filter((m) => m.group === g),
  })).filter((x) => x.items.length > 0)

  return (
    <>
      <AppTopbar
        eyebrow="Sistema"
        title="Estado del sistema"
        description="Monitoreo, validación de workflows, registro de errores y control de calidad"
        unreadNotifications={unread}
        actions={<StatusAuditButton />}
      />

      <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
        {/* Dashboard de calidad */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((m) => {
            const Icon = m.icon
            return (
              <div key={m.label} className="sf-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-wide">{m.label}</span>
                </div>
                <p className={`mt-1 text-2xl font-bold ${m.cls}`}>{m.value}</p>
              </div>
            )
          })}
        </div>

        {/* Estado de sistemas */}
        <section className="sf-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Estado de sistemas</h2>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Operativo</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" /> Advertencia</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-500" /> Error</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Sin revisar</span>
            </div>
          </div>
          <div className="space-y-4">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((m) => {
                    const { status, msg } = moduleStatus(m.probe)
                    return (
                      <div
                        key={m.key}
                        className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2.5"
                        title={msg ?? DOT_LABEL[status]}
                      >
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT[status]}`} />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{m.label}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {msg ?? DOT_LABEL[status]}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {latestAudit && (
            <p className="mt-4 text-[11px] text-muted-foreground">
              Última auditoría: {new Date(latestAudit.createdAt).toLocaleString("es-DO")}
            </p>
          )}
        </section>

        {/* Workflows */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Workflows del sistema ({STATUS_WORKFLOWS.length})
          </h2>
          <div className="space-y-2.5">
            {STATUS_WORKFLOWS.map((w) => {
              const st = states[w.key]
              return (
                <WorkflowCard
                  key={w.key}
                  workflowKey={w.key}
                  name={w.name}
                  description={w.description}
                  modules={w.modules}
                  checklist={w.checklist}
                  initialChecked={st?.checklist ?? {}}
                  initialNotes={st?.notes ?? ""}
                  lastValidatedAt={st?.lastValidatedAt ?? null}
                />
              )
            })}
          </div>
        </section>

        {/* Registro de errores */}
        <ErrorRegistry
          errors={errors}
          modules={STATUS_MODULES.map((m) => ({ key: m.key, label: m.label }))}
        />

        {/* Historial de pruebas */}
        <section className="sf-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Historial de pruebas</h2>
          </div>
          {testRuns.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay pruebas registradas. Marca un workflow como validado o registra el resultado de una prueba.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {testRuns.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {t.workflowKey ?? "General"}
                      {t.notes ? <span className="text-muted-foreground"> — {t.notes}</span> : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.runByName ?? "—"} · {new Date(t.createdAt).toLocaleString("es-DO")}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      t.result === "passed"
                        ? "bg-emerald-100 text-emerald-700"
                        : t.result === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {t.result}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
