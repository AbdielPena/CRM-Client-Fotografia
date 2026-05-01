import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { EmptyState } from "@/components/shared/empty-state"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatDateShort } from "@/lib/utils/currency"
import { Mail } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Cola de emails" }
export const dynamic = "force-dynamic"

type Row = {
  id: string
  to_email: string
  subject: string
  status: string
  attempts: number
  max_attempts: number
  sent_at: string | null
  failed_at: string | null
  last_error: string | null
  created_at: string
  template_slug: string | null
}

export default async function EmailQueuePage() {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const [{ data, error }, unread] = await Promise.all([
    supabase
      .from("email_queue")
      .select(
        "id, to_email, subject, status, attempts, max_attempts, sent_at, failed_at, last_error, created_at, template_slug",
      )
      .eq("studio_id", session.studioId)
      .order("created_at", { ascending: false })
      .limit(100),
    countUnreadNotifications(session.studioId),
  ])

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Row[]

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Cola de emails"
        description="Últimos 100 correos automáticos. El worker los procesa cada 2 minutos."
        unreadNotifications={unread}
      />

      <div className="p-6">
        <div className="sf-card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Mail className="h-5 w-5" />}
              title="Sin emails enviados"
              description="Cuando alguien reserve por tu link público, los correos aparecerán aquí."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Asunto
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Destinatario
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                    Intentos
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground truncate max-w-[380px]">
                        {r.subject}
                      </p>
                      {r.template_slug && (
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {r.template_slug}
                        </p>
                      )}
                      {r.last_error && r.status === "failed" && (
                        <p className="text-[11px] text-red-500 mt-0.5 truncate max-w-[380px]">
                          {r.last_error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-foreground truncate max-w-[200px]">
                      {r.to_email}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {r.attempts}/{r.max_attempts}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                      {formatDateShort(
                        new Date(r.sent_at ?? r.failed_at ?? r.created_at),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Configura tu dominio de envío y la API key de Resend desde
          Configuración → Integraciones para enviar emails reales.
        </p>
      </div>
    </>
  )
}
