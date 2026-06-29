import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { untypedService } from "@/server/supabase/untyped"
import { createGalleryAction } from "@/server/actions/gallery.actions"

export const metadata: Metadata = { title: "Nueva galería" }

export default async function NewGalleryPage({
  searchParams,
}: {
  searchParams: { clientId?: string; projectId?: string }
}) {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const [clientsRes, projectsRes, unread] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, client_id")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    countUnreadNotifications(session.studioId),
  ])

  const clients = (clientsRes.data ?? []) as Array<{ id: string; name: string }>
  const projects = (projectsRes.data ?? []) as Array<{
    id: string
    name: string
    client_id: string | null
  }>

  // Si viene de un proyecto con quinceañera registrada, pre-llenar el nombre de
  // la galería con el nombre de la quinceañera (columna nueva → cliente untyped).
  let prefillName = ""
  if (searchParams.projectId) {
    const { data: proj } = await untypedService()
      .from("projects")
      .select("quinceanera_name")
      .eq("id", searchParams.projectId)
      .maybeSingle()
    prefillName =
      (proj as { quinceanera_name?: string | null } | null)?.quinceanera_name ?? ""
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"

  return (
    <>
      <AppTopbar
        title="Nueva galería"
        description="Crea una colección nueva para entregarla a un cliente."
        unreadNotifications={unread}
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <form
          action={async (formData: FormData) => {
            "use server"
            const result = await createGalleryAction(formData)
            redirect(`/galleries/${result.id}`)
          }}
          className="max-w-2xl space-y-5"
        >
          <div className="rounded-xl border border-border bg-card p-6 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Tipo de galería</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="galleryType"
                  value="selection"
                  defaultChecked
                  className="peer sr-only"
                />
                <div className="h-full rounded-xl border border-border bg-background p-4 transition-colors peer-checked:border-brand peer-checked:ring-2 peer-checked:ring-brand/20">
                  <p className="text-sm font-semibold text-foreground">📷 Selección</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    El cliente elige sus fotos favoritas. Favoritos, colecciones y envío de selección.
                  </p>
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="galleryType"
                  value="final_delivery"
                  className="peer sr-only"
                />
                <div className="h-full rounded-xl border border-border bg-background p-4 transition-colors peer-checked:border-brand peer-checked:ring-2 peer-checked:ring-brand/20">
                  <p className="text-sm font-semibold text-foreground">✨ Entrega final</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Entrega de fotos editadas. Pistas Redes / Máxima Calidad, descarga y portada premium.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Información básica</h2>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Nombre de la galería <span className="text-danger">*</span>
              </label>
              <input
                name="name"
                required
                defaultValue={prefillName}
                placeholder="ej. Boda Andrea & Miguel — Sesión completa"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Descripción
              </label>
              <textarea
                name="description"
                rows={2}
                placeholder="Notas o mensaje de bienvenida para el cliente"
                className={`${inputCls} resize-none`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Cliente
                </label>
                <select
                  name="clientId"
                  defaultValue={searchParams.clientId ?? ""}
                  className={inputCls}
                >
                  <option value="">Sin cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vincular dispara automatización: el proyecto pasa a "Esperando selección".
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Proyecto (opcional)
                </label>
                <select
                  name="projectId"
                  defaultValue={searchParams.projectId ?? ""}
                  className={inputCls}
                >
                  <option value="">Sin proyecto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Privacidad</h2>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Visibilidad
              </label>
              <select name="visibility" defaultValue="private" className={inputCls}>
                <option value="private">Privada (solo con link directo)</option>
                <option value="password">Con contraseña</option>
                <option value="public">Pública (cualquiera con el link)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Contraseña (si aplica)
              </label>
              <input
                name="password"
                type="text"
                placeholder="Dejar vacío para no requerir"
                className={inputCls}
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <input
                id="allowDownload"
                name="allowDownload"
                type="checkbox"
                defaultChecked
                value="true"
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
              />
              <label htmlFor="allowDownload" className="text-sm text-foreground">
                Permitir descargas (con marca de agua si está activa)
              </label>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <input
                id="requireEmail"
                name="requireEmail"
                type="checkbox"
                value="true"
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
              />
              <label htmlFor="requireEmail" className="text-sm text-foreground">
                Requerir email del cliente para ver la galería
              </label>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Días de disponibilidad
              </label>
              <input
                name="availabilityDays"
                type="number"
                min={1}
                max={3650}
                placeholder="30 (se calcula la expiración al publicar)"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Cuántos días estará disponible para el cliente. Si lo dejas vacío, hereda del plan o usa 30.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
            >
              Crear galería
            </button>
            <Link
              href="/galleries"
              className="rounded-lg bg-muted/60 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </>
  )
}
