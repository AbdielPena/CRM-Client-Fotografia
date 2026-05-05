import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getProjectStatuses } from "@/server/services/project-status.service"
import { createProjectAction } from "@/server/actions/project.actions"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Nuevo proyecto" }

const PROJECT_TYPES = [
  { value: "xv_años", label: "XV años" },
  { value: "wedding", label: "Boda" },
  { value: "portrait", label: "Retrato" },
  { value: "family", label: "Familia" },
  { value: "corporate", label: "Corporativo" },
  { value: "newborn", label: "Recién nacido" },
  { value: "event", label: "Evento" },
  { value: "other", label: "Otro" },
]

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: { clientId?: string; status?: string }
}) {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const [clientsRes, packagesRes, unread, projectStatuses] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("packages")
      .select("id, name, price, currency")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    countUnreadNotifications(session.studioId),
    getProjectStatuses(session.studioId),
  ])

  const clients = clientsRes.data ?? []
  const packages = packagesRes.data ?? []
  // Status default: viene del searchParam (kanban CTA) o el primero del studio.
  const defaultStatus =
    searchParams.status &&
    projectStatuses.some((s) => s.label === searchParams.status)
      ? searchParams.status
      : (projectStatuses[0]?.label ?? "")

  return (
    <>
      <AppTopbar
        eyebrow="Proyectos"
        title="Nuevo proyecto"
        description="Crea un nuevo proyecto fotográfico"
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="max-w-2xl">
          <form
            action={async (formData: FormData) => {
              "use server"
              await createProjectAction(formData)
            }}
            className="space-y-6"
          >
            {/* Basic info */}
            <div className="sf-card p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Información básica</h2>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Cliente <span className="text-danger">*</span>
                </label>
                <select
                  name="clientId"
                  required
                  defaultValue={searchParams.clientId ?? ""}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-card"
                >
                  <option value="">Seleccionar cliente...</option>
                  {(clients as Array<{ id: string; name: string }>).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  ¿No está en la lista?{" "}
                  <Link href="/clients/new" className="text-primary hover:underline">
                    Crear nuevo cliente
                  </Link>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nombre del proyecto <span className="text-danger">*</span>
                </label>
                <input
                  name="name"
                  required
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                  placeholder="ej. Boda Andrea & Miguel"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Tipo <span className="text-danger">*</span>
                  </label>
                  <select
                    name="eventType"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-card"
                  >
                    <option value="">Seleccionar tipo...</option>
                    {PROJECT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Estado</label>
                  <select
                    name="status"
                    defaultValue={defaultStatus}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-card"
                  >
                    {projectStatuses.length === 0 && (
                      <option value="">Sin estados configurados</option>
                    )}
                    {projectStatuses.map((s) => (
                      <option key={s.id} value={s.label}>
                        {s.label}
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
                    type="datetime-local"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Ubicación
                  </label>
                  <input
                    name="location"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                    placeholder="Ciudad o venue"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Notas del proyecto
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 resize-none"
                  placeholder="Detalles, preferencias, requerimientos especiales..."
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="sf-card p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Paquete y precio</h2>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Paquete
                </label>
                <select
                  name="packageId"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-card"
                >
                  <option value="">Sin paquete</option>
                  {(packages as Array<{
                    id: string
                    name: string
                    price: number | string
                    currency: string
                  }>).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${Number(p.price).toLocaleString()} {p.currency}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Precio total
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    $
                  </span>
                  <input
                    name="totalAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full pl-7 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                    placeholder="0.00"
                  />
                </div>
                <input name="currency" type="hidden" value="DOP" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="px-5 py-2.5 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors"
              >
                Crear proyecto
              </button>
              <Link
                href="/projects"
                className="px-5 py-2.5 text-sm font-medium text-foreground bg-muted/60 rounded-lg hover:bg-muted transition-colors"
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
