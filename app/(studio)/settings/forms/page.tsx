import Link from "next/link"
import type { Metadata } from "next"
import { requireStudioAuth } from "@/server/middleware/auth"
import { listFormTemplates } from "@/server/services/form.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { EmptyState } from "@/components/shared/empty-state"
import { ClipboardList, Star, Circle } from "lucide-react"
import type { FormSchema } from "@/lib/forms/types"

export const metadata: Metadata = { title: "Formularios" }

export default async function FormTemplatesPage() {
  const session = await requireStudioAuth()
  const [templates, unread] = await Promise.all([
    listFormTemplates(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

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
            className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors"
          >
            + Nueva plantilla
          </Link>
        }
      />

      <div className="p-6">
        {templates.length === 0 ? (
          <div className="sf-card">
            <EmptyState
              icon={<ClipboardList className="h-5 w-5" />}
              title="Sin plantillas"
              description="Crea tu primera plantilla para recolectar información clave de tus clientes antes de cada sesión."
            >
              <Link
                href="/settings/forms/new"
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
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
                  const schema = (t.schema as unknown as FormSchema | null) ?? {
                    version: 1,
                    fields: [],
                  }
                  const fieldCount = Array.isArray(schema.fields)
                    ? schema.fields.length
                    : 0
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/settings/forms/${t.id}`}
                          className="flex items-center gap-2"
                        >
                          {t.is_default ? (
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                          ) : (
                            <ClipboardList className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <p className="font-medium text-foreground group-hover:text-blue-600 transition-colors">
                              {t.name}
                            </p>
                            {t.description && (
                              <p className="text-xs text-muted-foreground">
                                {t.description}
                              </p>
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
