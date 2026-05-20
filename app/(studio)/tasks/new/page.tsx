import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { untypedServer } from "@/server/supabase/untyped"

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

  // Members del studio (para asignación)
  const [membersRes, clientsRes, projectsRes, unread] = await Promise.all([
    sb
      .from("studio_members")
      .select(
        `user_id, role,
         user:auth_users(id, email, raw_user_meta_data)`,
      )
      .eq("studio_id", session.studioId)
      .limit(50),
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

  type MemberRow = {
    user_id: string
    role: string
    user?: {
      id: string
      email: string
      raw_user_meta_data: { full_name?: string } | null
    } | null
  }
  const members = ((membersRes.data ?? []) as MemberRow[]).map((m) => ({
    userId: m.user_id,
    email: m.user?.email ?? "",
    name: m.user?.raw_user_meta_data?.full_name ?? null,
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
