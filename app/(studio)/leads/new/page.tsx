import { requireStudioAuth } from "@/server/middleware/auth"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { createLeadAction } from "@/server/actions/lead.actions"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Nuevo lead" }

const SOURCES = [
  { value: "REFERRAL", label: "Referido" },
  { value: "WEBSITE", label: "Sitio web" },
  { value: "SOCIAL_MEDIA", label: "Redes sociales" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Teléfono" },
  { value: "OTHER", label: "Otro" },
]

const EVENT_TYPES = [
  { value: "wedding", label: "Boda" },
  { value: "portrait", label: "Retrato" },
  { value: "family", label: "Familia" },
  { value: "corporate", label: "Corporativo" },
  { value: "quinceañera", label: "Quinceañera" },
  { value: "newborn", label: "Recién nacido" },
  { value: "event", label: "Evento" },
  { value: "other", label: "Otro" },
]

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Pipeline de leads"
        title="Nuevo lead"
        description="Registra un nuevo prospecto en tu pipeline"
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="max-w-2xl">
          <form
            action={async (formData: FormData) => {
              "use server"
              await createLeadAction(formData)
            }}
            className="space-y-6"
          >
            {/* Basic info */}
            <div className="sf-card p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Información básica</h2>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  required
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                  placeholder="Nombre del prospecto o pareja"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                  <input
                    name="email"
                    type="email"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                    placeholder="correo@ejemplo.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Teléfono</label>
                  <input
                    name="phone"
                    type="tel"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                    placeholder="+1 555 0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Fuente</label>
                  <select
                    name="source"
                    defaultValue="WEBSITE"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-background"
                  >
                    {SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Tipo de evento
                  </label>
                  <select
                    name="eventType"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-background"
                  >
                    <option value="">Sin especificar</option>
                    {EVENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Event details */}
            <div className="sf-card p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Detalles del evento</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Fecha del evento
                  </label>
                  <input
                    name="eventDate"
                    type="date"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Presupuesto estimado
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      $
                    </span>
                    <input
                      name="budget"
                      type="number"
                      min="0"
                      step="50"
                      className="w-full pl-7 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Notas internas
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 resize-none"
                  placeholder="Información adicional sobre el lead..."
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="px-5 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors"
              >
                Crear lead
              </button>
              <Link
                href="/leads"
                className="px-5 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/70 transition-colors"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
