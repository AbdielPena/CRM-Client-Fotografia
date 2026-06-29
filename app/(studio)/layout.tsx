import { cookies } from "next/headers"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { LiveRefresh } from "@/components/shared/live-refresh"
import {
  SIDEBAR_COOKIE_NAME,
  SidebarProvider,
} from "@/components/layout/sidebar-context"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getSidebarBadges } from "@/server/services/sidebar-badges.service"

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireStudioAuth()
  const [unread, badges] = await Promise.all([
    countUnreadNotifications(session.studioId),
    getSidebarBadges(session.studioId, session.userId).catch(
      () => ({}) as Record<string, number>,
    ),
  ])

  const cookieStore = cookies()
  const sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === "1"

  return (
    <SidebarProvider initialCollapsed={sidebarCollapsed}>
      {/* Auto-refresco en vivo: re-pide los datos al volver a la pestaña + cada 30s */}
      <LiveRefresh />
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <AppSidebar
          studioName={session.studioName}
          userName={session.name || session.email}
          userEmail={session.email}
          userRole={session.role}
          unreadNotifications={unread}
          badges={badges}
        />
        {/* Ambient Aurora glow detrás del contenido — muy sutil */}
        <main className="relative flex-1 overflow-y-auto">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] opacity-[0.35] dark:opacity-[0.22]"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 60% 80% at 20% 0%, hsl(var(--brand) / 0.22), transparent 55%), radial-gradient(ellipse 50% 70% at 85% 10%, hsl(292 84% 60% / 0.16), transparent 60%)",
            }}
          />
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
