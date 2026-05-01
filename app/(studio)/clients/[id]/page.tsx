import { notFound } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import { getClientById } from "@/server/services/client.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { StatusBadge } from "@/components/shared/status-badge"
import { NoteForm } from "@/components/shared/note-form"
import { ClientDetailActions } from "@/components/clients/client-detail-actions"
import { ClientCreatedToast } from "@/components/clients/client-created-toast"
import { formatDate, formatDateShort } from "@/lib/utils/currency"
import {
  Mail,
  Phone,
  MapPin,
  Instagram,
  Globe,
  FolderOpen,
} from "lucide-react"
import { DeleteClientButton } from "@/components/clients/delete-client-button"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Perfil del cliente" }

const PROJECT_TYPE_LABELS: Record<string, string> = {
  wedding: "Boda",
  portrait: "Retrato",
  family: "Familia",
  corporate: "Corporativo",
  quinceañera: "Quinceañera",
  xv_años: "XV años",
  newborn: "Recién nacido",
  event: "Evento",
  other: "Otro",
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const session = await requireStudioAuth()
  const [client, unread] = await Promise.all([
    getClientById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!client) notFound()

  const projects = (client.projects ?? []) as Array<Record<string, unknown>>
  const notes = (client.notes_rel ?? []) as Array<Record<string, unknown>>

  return (
    <>
      <ClientCreatedToast />
      <AppTopbar
        eyebrow="Clientes"
        title={client.name}
        description={`Cliente desde ${formatDateShort(new Date(client.created_at))}`}
        unreadNotifications={unread}
        actions={<ClientDetailActions client={client} />}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Projects */}
          <div className="sf-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Proyectos ({projects.length})
                </h2>
              </div>
              <Link
                href={`/projects/new?clientId=${client.id}`}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                + Nuevo proyecto
              </Link>
            </div>

            {projects.length === 0 ? (
              <div className="py-10 text-center">
                <FolderOpen className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sin proyectos todavía</p>
                <Link
                  href={`/projects/new?clientId=${client.id}`}
                  className="text-xs text-primary hover:underline mt-1 inline-block"
                >
                  Crear primer proyecto →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {projects.map((project) => {
                  const eventType = (project.event_type as string | null) ?? null
                  const eventDate = (project.event_date as string | null) ?? null
                  return (
                    <Link
                      key={String(project.id)}
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors group"
                    >
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {String(project.name)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(eventType && PROJECT_TYPE_LABELS[eventType]) ?? eventType ?? "Proyecto"}
                          {eventDate ? ` · ${formatDate(new Date(eventDate))}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={String(project.status)} />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Internal notes */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Notas internas</h2>
            <NoteForm entityType="client" entityId={client.id} />

            <div className="mt-4 space-y-3">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin notas todavía.</p>
              ) : (
                notes.map((note) => (
                  <div
                    key={String(note.id)}
                    className="border-l-2 border-border pl-3 py-1"
                  >
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {String(note.content ?? "")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateShort(new Date(String(note.created_at)))}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Avatar + contact */}
          <div className="sf-card p-5">
            <div className="flex flex-col items-center mb-5">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white text-2xl font-bold mb-3">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-base font-semibold text-foreground text-center">{client.name}</h3>
              {client.source && (
                <p className="text-xs text-muted-foreground mt-1 capitalize">
                  {String(client.source).toLowerCase().replace(/_/g, " ")}
                </p>
              )}
            </div>

            <dl className="space-y-3">
              {client.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={`mailto:${client.email}`} className="text-sm text-primary hover:underline truncate">
                    {client.email}
                  </a>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={`tel:${client.phone}`} className="text-sm text-foreground hover:text-primary">
                    {client.phone}
                  </a>
                </div>
              )}
              {(client.city || client.country) && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-foreground">
                    {[client.city, client.country].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
              {client.instagram_handle && (
                <div className="flex items-center gap-3">
                  <Instagram className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a
                    href={`https://instagram.com/${client.instagram_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    @{client.instagram_handle}
                  </a>
                </div>
              )}
              {client.website_url && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a
                    href={client.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate"
                  >
                    {String(client.website_url).replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
            </dl>
          </div>

          {/* Stats */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Resumen</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total proyectos</dt>
                <dd className="font-medium text-foreground">{projects.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cliente desde</dt>
                <dd className="text-foreground">{formatDateShort(new Date(client.created_at))}</dd>
              </div>
            </dl>
          </div>

          {/* Client notes */}
          {client.notes && (
            <div className="sf-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Notas del perfil</h2>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{client.notes as string}</p>
            </div>
          )}

          {/* Danger zone */}
          <div className="sf-card p-5 border-red-100">
            <h2 className="text-sm font-semibold text-red-700 mb-3">Zona de peligro</h2>
            <DeleteClientButton
              clientId={client.id as string}
              clientName={client.name as string}
            />
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
