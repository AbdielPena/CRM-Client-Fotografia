import Link from "next/link"
import {
  Rocket,
  CheckCircle2,
  Circle,
  SkipForward,
  ArrowRight,
  Sparkles,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  autoDetectCompletedSteps,
  calculateProgress,
  getOnboardingSteps,
} from "@/server/services/onboarding.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { OnboardingStepActions } from "./step-actions"

export const metadata: Metadata = { title: "Bienvenido · Onboarding" }

const CATEGORY_LABELS: Record<string, string> = {
  setup: "Configuración inicial",
  crm: "Tu primer cliente",
  integrations: "Integraciones",
  automation: "Automatizaciones",
  team: "Tu equipo",
  general: "General",
}

export default async function OnboardingPage() {
  const session = await requireStudioAuth()

  // Auto-detect lo que ya está hecho
  await autoDetectCompletedSteps(session.studioId).catch(() => null)

  const [steps, unread] = await Promise.all([
    getOnboardingSteps(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const progress = calculateProgress(steps)

  // Agrupar por categoría
  const byCategory = steps.reduce<Record<string, typeof steps>>((acc, s) => {
    acc[s.category] = acc[s.category] ?? []
    acc[s.category].push(s)
    return acc
  }, {})

  return (
    <>
      <AppTopbar
        eyebrow="Primeros pasos"
        title={`Hola, ${session.name?.split(" ")[0] ?? "fotógrafo"} 👋`}
        description={
          progress.isComplete
            ? "¡Felicidades! Completaste el onboarding."
            : `${progress.percentage}% completado · ${steps.length - progress.completed - progress.skipped} pasos pendientes`
        }
        unreadNotifications={unread}
      />

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Progress hero */}
        <section className="sf-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <span
              className={
                "inline-flex size-12 items-center justify-center rounded-full " +
                (progress.isComplete
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-primary/10 text-primary")
              }
            >
              {progress.isComplete ? (
                <CheckCircle2 className="size-6" />
              ) : (
                <Rocket className="size-6" />
              )}
            </span>
            <div className="flex-1">
              <h2 className="text-lg font-bold">
                {progress.isComplete
                  ? "Listo para volar"
                  : "Configura tu estudio"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {progress.completed} de {progress.total} completados
                {progress.skipped > 0 && ` · ${progress.skipped} saltados`}
              </p>
            </div>
            {progress.isComplete && (
              <Button asChild>
                <Link href="/dashboard">
                  <Sparkles className="mr-1 size-4" />
                  Ir al dashboard
                </Link>
              </Button>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </section>

        {/* Steps por categoría */}
        {Object.entries(byCategory).map(([category, categorySteps]) => (
          <section key={category}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <ul className="space-y-2">
              {categorySteps.map((s) => {
                const status = s.is_completed
                  ? "done"
                  : s.is_skipped
                    ? "skipped"
                    : "pending"
                return (
                  <li
                    key={s.id}
                    className={
                      "sf-card flex items-start gap-3 p-4 transition-colors " +
                      (status === "done"
                        ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20"
                        : status === "skipped"
                          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 opacity-60"
                          : "border-border bg-card hover:border-primary/40")
                    }
                  >
                    {/* Icon */}
                    <span
                      className={
                        "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full " +
                        (status === "done"
                          ? "bg-emerald-500 text-white"
                          : status === "skipped"
                            ? "bg-zinc-300 text-zinc-600 dark:bg-zinc-700"
                            : "border-2 border-muted-foreground/30 text-muted-foreground")
                      }
                    >
                      {status === "done" ? (
                        <CheckCircle2 className="size-4" />
                      ) : status === "skipped" ? (
                        <SkipForward className="size-3" />
                      ) : (
                        <Circle className="size-3" />
                      )}
                    </span>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <h4
                        className={
                          "text-sm font-semibold " +
                          (status === "skipped" ? "line-through" : "")
                        }
                      >
                        {s.title}
                      </h4>
                      {s.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {s.description}
                        </p>
                      )}
                    </div>

                    {/* Action */}
                    {status === "pending" && (
                      <div className="flex items-center gap-2">
                        {s.action_url && (
                          <Button asChild size="sm">
                            <Link href={s.action_url}>
                              {s.action_label ?? "Ir"}
                              <ArrowRight className="ml-1 size-3" />
                            </Link>
                          </Button>
                        )}
                        <OnboardingStepActions stepKey={s.step_key} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {progress.isComplete && (
          <section className="sf-card border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
            <Sparkles className="mx-auto mb-2 size-8 text-emerald-500" />
            <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-100">
              ¡Estás listo!
            </h3>
            <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
              Tu estudio está configurado. Si necesitas ayuda, contáctanos en
              hola@abbypixel.com o explora /docs.
            </p>
          </section>
        )}
      </main>
    </>
  )
}
