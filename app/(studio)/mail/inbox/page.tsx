import { Mail, Construction, Settings } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Bandeja de entrada" }

/**
 * Placeholder de la inbox de Mail. La integración completa con Mailcow IMAP
 * está en F6 final (mail-imap-sync.service.ts + UI lista de mensajes).
 *
 * Por ahora muestra un estado "en construcción" con CTA para configurar
 * cuenta Mailcow cuando esté disponible.
 */
export default async function MailInboxPage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Correo"
        title="Bandeja de entrada"
        description="Inbox completo del estudio — leer, responder y archivar correos vía Mailcow."
        unreadNotifications={unread}
      />

      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="sf-card flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary/10">
            <Mail className="size-10 text-primary" />
          </div>

          <h2 className="font-display text-2xl text-foreground">
            Módulo de correo en preparación
          </h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            El schema de inbox está listo (7 tablas <code>mail_*</code> + RPC de
            threading), el cliente IMAP/SMTP de Mailcow funciona, y los webhooks
            están definidos. Falta el sync job (cron 5min) y los componentes UI
            de inbox + compose.
          </p>

          <div className="mt-6 flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Construction className="size-3" />
            F6 en construcción
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" asChild>
              <Link href="/settings/integrations">
                <Settings className="mr-1 size-4" />
                Configurar Mailcow
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard">Volver al dashboard</Link>
            </Button>
          </div>
        </div>

        {/* Lista de features previstas */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FeatureCard
            title="IMAP polling c/5min"
            description="Sync incremental de nuevos mensajes vía UID-FETCH"
          />
          <FeatureCard
            title="Threading RFC 5322"
            description="Agrupación por Message-ID + In-Reply-To + References"
          />
          <FeatureCard
            title="Búsqueda full-text"
            description="GIN index sobre subject, snippet, from, body"
          />
          <FeatureCard
            title="Cross-módulo"
            description="Linkear thread a cliente, proyecto, factura del CRM"
          />
          <FeatureCard
            title="Adjuntos en Storage"
            description="Supabase Storage bucket privado por studio"
          />
          <FeatureCard
            title="Envío vía SMTP"
            description="Compose + reply con DKIM/SPF de Mailcow"
          />
        </div>
      </main>
    </>
  )
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="sf-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
