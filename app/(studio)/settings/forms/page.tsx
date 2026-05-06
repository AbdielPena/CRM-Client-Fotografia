import Link from "next/link"
import type { Metadata } from "next"
import { ClipboardList, Star, Circle, AlertTriangle } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { AppTopbar } from "@/components/layout/app-topbar"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Formularios" }
export const dynamic = "force-dynamic"

type Template = {
  id: string
  name: string
  description: string | null
  is_active: boolean
  is_default: boolean
  schema: unknown
}

export default async function FormTemplatesPage() {
  const session = await requireStudioAuth()

  // Defensa MAX: importamos los services dinámicamente con try/catch para que
  // un error de import no rompa la página entera.
  let templates: Template[] = []
  let unread = 0
  let loadError: string | null = null

  try {
    const [{ listFormTemplates }, { countUnreadNotifications }] = await Promise.all([
      import("@/server/services/form.service"),
      import("@/server/services/notification.service"),
    ])

    const [t, u] = await Promise.all([
      listFormTemplates(session.studioId).catch((err) => {
        console.error("[settings/forms] listFormTemplates failed", err)
        throw err
      }),
      countUnreadNotifications(session.studioId).catch(() => 0),
    ])
    templates = t as Template[]
    unread = u
  } catch (err) {
    console.error("[settings/forms] page load failed", err)
    loadError =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : "No se pudieron cargar las plantillas de formularios."
  }

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Formularios"
        description="Plantillas que se envían a tus clientes (cuestionarios de XV años, shot list, contacto, etc.)"
        unreadNotifications={unread}
        actions={
          <Link
            href="/settings/forms/new"
            className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors"
          >
            + Nueva plantilla
          </Link>
        }
      />

      <div className="p-6">
        {loadError ? (
          <div className="sf-card p-6">
            <div className="flex items-start gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-danger">No pudimos cargar las plantillas</p>
                <p className="mt-1 text-body-sm text-danger/80">{loadError}</p>
                <p className="mt-2 text-caption text-muted-foreground">
                  Probá recargar la página. Si el problema persiste, abrí <code>/api/_debug/forms</code> para ver detalles.
                </p>
              </div>
            </div>
          </div>
        ) : templates.length === 0 ? (
          <div className="sf-card">
            <EmptyState
              icon={<ClipboardList className="h-5 w-5" />}
              title="Sin plantillas"
              description="Crea tu primera plantilla para recolectar información clave de tus clientes antes de cada sesión."
            >
              <Link
                href="/settings/forms/new"
                className="px-4 py-2 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors"
              >
                + Nueva plantilla
              </Link>
            </EmptyState>
          </div>
        ) : (
          <div className="sf-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Plantilla
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Campos
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {templates.map((t) => {
                  const schema = (t.schema ?? {}) as { fields?: unknown[] }
                  const fieldCount = Array.isArray(schema.fields) ? schema.fields.length : 0
                  return (
                    <tr key={t.id} className="hover:bg-muted/40 transition-colors group">
                      <td className="px-5 py-3.5">
                        <Link href={`/settings/forms/${t.id}`} className="flex items-center gap-2">
                          {t.is_default ? (
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                          ) : (
                            <ClipboardList className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <p className="font-medium text-foreground group-hover:text-brand transition-colors">
                              {t.name}
                            </p>
                            {t.description && (
                              <p className="text-xs text-muted-foreground">{t.description}</p>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell text-foreground/80">
                        {fieldCount} {fieldCount === 1 ? "campo" : "campos"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                            t.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-muted/60 text-muted-foreground"
                          }`}
                        >
                          <Circle
                            className={`h-2 w-2 ${
                              t.is_active
                                ? "fill-emerald-500 text-emerald-500"
                                : "fill-gray-400 text-muted-foreground"
                            }`}
                          />
                          {t.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
