import type { Metadata } from "next"
import { Webhook, AlertCircle } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listOutboundWebhooks } from "@/server/services/outbound-webhook.service"

import { AppTopbar } from "@/components/layout/app-topbar"

import { WebhooksManager } from "./webhooks-manager"

export const metadata: Metadata = { title: "Webhooks · Configuración" }

export default async function WebhooksSettingsPage() {
  const session = await requireStudioAuth()

  const [webhooks, unread] = await Promise.all([
    listOutboundWebhooks(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Webhooks salientes"
        description="Recibe eventos en tu URL (Zapier, n8n, custom). Firmados con HMAC SHA-256."
        unreadNotifications={unread}
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <WebhooksManager webhooks={webhooks} />

        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Webhook className="mr-1 inline size-3.5" />
            Cómo validar la firma
          </h3>
          <p className="text-xs text-muted-foreground">
            Cada request incluye el header{" "}
            <code className="rounded bg-muted px-1">X-StudioFlow-Signature</code>{" "}
            con valor <code className="rounded bg-muted px-1">sha256=&lt;hex&gt;</code>.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-muted px-3 py-2 text-[10px]">
{`// Node.js / TypeScript
import { createHmac } from "crypto"

const signature = req.headers["x-studioflow-signature"]?.replace("sha256=", "")
const expected = createHmac("sha256", WEBHOOK_SECRET)
  .update(rawBody)
  .digest("hex")

if (signature !== expected) {
  return res.status(401).send("Invalid signature")
}`}
          </pre>
          <p className="mt-3 text-[10px] text-muted-foreground">
            <AlertCircle className="mr-1 inline size-3" />
            Después de 10 fallos consecutivos, el webhook se auto-desactiva.
            Re-actívalo en /settings/webhooks cuando arregles el endpoint.
          </p>
        </section>
      </main>
    </>
  )
}
