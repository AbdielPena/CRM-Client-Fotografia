import Link from "next/link"
import type { Metadata } from "next"
import { Mail, Pencil, Check } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  listStudioTemplates,
  TEMPLATE_CATALOG,
  type TemplateSlug,
} from "@/server/services/email-template.service"
import { AppTopbar } from "@/components/layout/app-topbar"

export const metadata: Metadata = { title: "Plantillas de email" }
export const dynamic = "force-dynamic"

const CATEGORY_LABEL: Record<string, string> = {
  client: "Cliente",
  booking: "Reservas",
  contract: "Contratos",
  invoice: "Facturas y pagos",
  gallery: "Galerías",
  delivery: "Entregas",
}

export default async function EmailTemplatesPage() {
  const session = await requireStudioAuth()
  const [templates, unread] = await Promise.all([
    listStudioTemplates(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const customizedSlugs = new Set(templates.map((t) => t.slug))

  // Agrupar por categoría
  const grouped: Record<string, Array<{ slug: TemplateSlug; entry: (typeof TEMPLATE_CATALOG)[TemplateSlug] }>> = {}
  for (const slug of Object.keys(TEMPLATE_CATALOG) as TemplateSlug[]) {
    const entry = TEMPLATE_CATALOG[slug]
    if (!grouped[entry.category]) grouped[entry.category] = []
    grouped[entry.category].push({ slug, entry })
  }

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Plantillas de email"
        description="Personalizá los textos automáticos que se envían a tus clientes en cada acción."
        unreadNotifications={unread}
      />

      <div className="space-y-6 px-6 py-6 lg:px-8">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="sf-card overflow-hidden">
            <div className="border-b border-border/60 bg-muted/20 px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                {CATEGORY_LABEL[cat] ?? cat}
              </h2>
            </div>
            <ul className="divide-y divide-border/40">
              {items.map(({ slug, entry }) => {
                const customized = customizedSlugs.has(slug)
                return (
                  <li
                    key={slug}
                    className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{entry.label}</p>
                        {customized && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <Check className="h-2.5 w-2.5" />
                            Personalizada
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.description}
                      </p>
                      <code className="mt-0.5 inline-block text-[10.5px] text-muted-foreground">
                        {slug}
                      </code>
                    </div>
                    <Link
                      href={`/settings/emails/templates/${slug}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </>
  )
}
