"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Sparkles,
  Play,
  Plus,
  Trash2,
  Loader2,
  Mail,
  Cake,
  Star,
  HeartHandshake,
  Power,
} from "lucide-react"
import { toast } from "sonner"

import {
  createEngagementPresetAction,
  toggleEngagementAutomationAction,
  deleteEngagementAutomationAction,
  runEngagementNowAction,
} from "@/server/actions/engagement.actions"
import { ENGAGEMENT_PRESET_LIST, TRIGGER_LABELS } from "@/lib/engagement/presets"

interface AutomationRow {
  id: string
  name: string
  description: string | null
  trigger_type: string
  is_active: boolean
  total_enrolled: number
  steps: number
  created_at: string
}

function triggerIcon(t: string) {
  if (t === "date_birthday") return <Cake className="h-4 w-4" />
  if (t === "date_inactivity") return <HeartHandshake className="h-4 w-4" />
  if (t === "date_final_delivery") return <Star className="h-4 w-4" />
  return <Mail className="h-4 w-4" />
}

export function EngagementManager({ automations }: { automations: AutomationRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const activate = (key: string) =>
    start(async () => {
      const r = await createEngagementPresetAction(key)
      if (r.ok) {
        toast.success("Automatización activada")
        router.refresh()
      } else {
        toast.error(r.message ?? "Error")
      }
    })

  const toggle = (id: string, active: boolean) => {
    setBusyId(id)
    start(async () => {
      const r = await toggleEngagementAutomationAction(id, active)
      if (r.ok) router.refresh()
      else toast.error(r.message ?? "Error")
      setBusyId(null)
    })
  }

  const remove = (id: string) => {
    if (!confirm("¿Eliminar esta automatización?")) return
    setBusyId(id)
    start(async () => {
      const r = await deleteEngagementAutomationAction(id)
      if (r.ok) {
        toast.success("Eliminada")
        router.refresh()
      } else toast.error(r.message ?? "Error")
      setBusyId(null)
    })
  }

  const runNow = () =>
    start(async () => {
      const r = await runEngagementNowAction()
      if (r.ok) {
        toast.success(`Ciclo ejecutado: ${r.enrolled ?? 0} inscritos, ${r.steps ?? 0} pasos`)
        router.refresh()
      } else toast.error(r.message ?? "Error")
    })

  const activeKeys = new Set(automations.map((a) => a.name))

  return (
    <div className="max-w-5xl space-y-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runNow}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Ejecutar ahora
        </button>
        <Link
          href="/engagement/new"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:border-brand"
        >
          <Plus className="h-4 w-4" /> Crear automatización
        </Link>
        <Link
          href="/settings/emails/templates"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:border-border-strong"
        >
          <Mail className="h-4 w-4" /> Editar plantillas
        </Link>
        <p className="ml-auto text-[12px] text-muted-foreground">
          El cron procesa los envíos automáticamente; "Ejecutar ahora" es para probar.
        </p>
      </div>

      {/* Presets */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Plantillas listas (1 clic)</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENGAGEMENT_PRESET_LIST.map((p) => {
            const already = activeKeys.has(p.name)
            return (
              <div key={p.key} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-lg">{p.emoji}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                    {TRIGGER_LABELS[p.triggerType] ?? p.triggerType}
                  </span>
                </div>
                <p className="text-[13px] font-semibold text-foreground">{p.name}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{p.description}</p>
                <button
                  type="button"
                  onClick={() => activate(p.key)}
                  disabled={pending || already}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-brand disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {already ? "Ya activa" : "Activar"}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Lista */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Tus automatizaciones ({automations.length})
        </h2>
        {automations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              Aún no tienes automatizaciones. Activa una plantilla de arriba para empezar a fidelizar.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {automations.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    a.is_active ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {triggerIcon(a.trigger_type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{a.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
                    <span>{TRIGGER_LABELS[a.trigger_type] ?? a.trigger_type}</span>
                    <span>·</span>
                    <span>{a.steps} paso{a.steps === 1 ? "" : "s"}</span>
                    <span>·</span>
                    <span>{a.total_enrolled} inscrito{a.total_enrolled === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(a.id, !a.is_active)}
                  disabled={pending && busyId === a.id}
                  title={a.is_active ? "Desactivar" : "Activar"}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors ${
                    a.is_active
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  {a.is_active ? "Activa" : "Pausada"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  disabled={pending && busyId === a.id}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
