import Link from "next/link"
import { Key, AlertCircle, Lock, ExternalLink } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listApiTokens } from "@/server/services/api-token.service"
import { hasFeature } from "@/server/services/billing.service"
import { formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { ApiTokensManager } from "./api-tokens-manager"

export const metadata: Metadata = { title: "API · Configuración" }

export default async function ApiTokensPage() {
  const session = await requireStudioAuth()

  const [tokens, unread, canApi] = await Promise.all([
    listApiTokens(session.studioId),
    countUnreadNotifications(session.studioId),
    hasFeature(session.studioId, "api_access"),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="API y tokens"
        description="Genera tokens Bearer para que aplicaciones externas accedan a tus datos via REST API."
        unreadNotifications={unread}
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {!canApi && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <span>
              <Lock className="mr-1 inline size-4" />
              El acceso a la API requiere plan Studio o superior.
            </span>
            <Button asChild size="sm">
              <Link href="/settings/billing">Ver planes</Link>
            </Button>
          </div>
        )}

        <ApiTokensManager tokens={tokens} canCreate={canApi} />

        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Key className="mr-1 inline size-3.5" />
            Cómo usar la API
          </h3>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li>
              Base URL:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                https://my.abbypixel.com/api/v1
              </code>
            </li>
            <li>
              Header:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                Authorization: Bearer sf_XXXXXXX
              </code>
            </li>
            <li>
              Endpoints disponibles:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                GET/POST /clients
              </code>{" "}
              (más próximamente)
            </li>
            <li>
              Scopes:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">read</code>{" "}
              (solo GET),{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">write</code>{" "}
              (GET+POST+PUT+DELETE),{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">admin</code>{" "}
              (todo)
            </li>
            <li>
              Rate limit: 100 req/min por token (sin enforce duro V1)
            </li>
            <li>
              <Link
                href="/docs/api"
                className="text-primary hover:underline"
              >
                Ver docs completa <ExternalLink className="inline size-3" />
              </Link>
            </li>
          </ul>
        </section>
      </main>
    </>
  )
}
