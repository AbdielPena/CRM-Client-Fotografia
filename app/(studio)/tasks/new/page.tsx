import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { untypedServer } from "@/server/supabase/untyped"
import { listMembers } from "@/server/services/studio-members.service"

import { AppTopbar } from "@/components/layout/app-topbar"

import { NewTaskForm } from "./new-task-form"

export const metadata: Metadata = { title: "Nueva tarea" }

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams?: { entityType?: string; entityId?: string }
}) {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  // Members del studio (para asignación). listMembers resuelve el email vía la
  // admin API (auth.users no es embebible por PostgREST → causaba 500).
  const [memberList, clientsRes, projectsRes, unread] = await Promise.all([
    listMembers(session.studioId),
    sb
      .from("clients")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name")
      .limit(100),
    sb
      .from("projects")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name")
      .limit(100),
    countUnreadNotifications(session.studioId),
  ])

  const members = memberList.map((m) => ({
    userId: m.user_id,
    email: m.email ?? "",
    name: m.name,
    role: m.role,
  }))
  const clients = (clientsRes.data ?? []) as Array<{ id: string; name: string }>
  const projects = (projectsRes.data ?? []) as Array<{
    id: string
    name: string
  }>

  return (
    <>
      <AppTopbar
        eyebrow="Tareas"
        title="Nueva tarea"
        description="Asigna a un miembro del equipo, define fecha + prioridad, vincula a una entidad."
        unreadNotifications={unread}
        actions={
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <NewTaskForm
          currentUserId={session.userId}
          members={members}
          clients={clients}
          projects={projects}
          prefillEntityType={searchParams?.entityType}
          prefillEntityId={searchParams?.entityId}
        />
      </div>
    </>
  )
}
