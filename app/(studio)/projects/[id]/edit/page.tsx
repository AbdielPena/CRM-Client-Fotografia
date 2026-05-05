import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { getProjectById } from "@/server/services/project.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { updateProjectAction } from "@/server/actions/project.actions"
import { AppTopbar } from "@/components/layout/app-topbar"

export const metadata: Metadata = { title: "Editar proyecto" }

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

const PROJECT_STATUSES = [
  { value: "inquiry", label: "Consulta" },
  { value: "booked", label: "Reservado" },
  { value: "in_progress", label: "En progreso" },
  { value: "editing", label: "Editando" },
  { value: "delivered", label: "Entregado" },
  { value: "archived", label: "Archivado" },
]

type Rec = Record<string, unknown>

export default async function EditProjectPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const [projectRaw, packagesRes, unread] = await Promise.all([
    getProjectById(session.studioId, params.id) as Promise<Rec | null>,
    supabase
      .from("packages")
      .select("id, name, price, currency")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    countUnreadNotifications(session.studioId),
  ])

  if (!projectRaw) notFound()
  const project = projectRaw

  const packages = (packagesRes.data ?? []) as Array<{
    id: string
    name: string
    price: number | string
    currency: string
  }>

  // Convertir event_date (timestamptz / date) → 'YYYY-MM-DDTHH:mm' para datetime-local
  const eventDateStr = project.event_date
    ? new Date(project.event_date as string).toISOString().slice(0, 16)
    : ""

  return (
    <>
      <AppTopbar
        eyebrow="Proyectos"
        title={`Editar: ${project.name as string}`}
        description="Modifica los datos del proyecto"
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="max-w-2xl">
          <form
            action={async (formData: FormData) => {
              "use server"
              const res = await updateProjectAction(params.id, formData)
              if (!("error" in res)) {
                redirect(`/projects/${params.id}`)
              }
            }}
            className="space-y-6"
          >
            {/* Basic info */}
            <div className="sf-card p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Información básica</h2>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nombre del proyecto <span className="text-danger">*</span>
                </label>
                <input
                  name="name"
                  required
                  defaultValue={project.name as string}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
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
                    defaultValue={(project.event_type as string) ?? ""}
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
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Estado
                  </label>
                  <select
                    name="status"
                    defaultValue={(project.status as string) ?? "booked"}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-card"
                  >
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
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
                    defaultValue={eventDateStr}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Ubicación
                  </label>
                  <input
                    name="location"
                    defaultValue={(project.location as string) ?? ""}
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
                  defaultValue={(project.notes as string) ?? ""}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 resize-none"
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
                  defaultValue={(project.package_id as string) ?? ""}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-card"
                >
                  <option value="">Sin paquete</option>
                  {packages.map((p) => (
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
                    defaultValue={
                      project.total_amount != null
                        ? Number(project.total_amount as number | string)
                        : ""
                    }
                    className="w-full pl-7 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="px-5 py-2.5 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors"
              >
                Guardar cambios
              </button>
              <Link
                href={`/projects/${params.id}`}
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
