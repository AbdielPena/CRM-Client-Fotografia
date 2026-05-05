import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getStudioTemplate,
  TEMPLATE_CATALOG,
  type TemplateSlug,
} from "@/server/services/email-template.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { TemplateEditor } from "@/components/settings/template-editor"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const cat = (TEMPLATE_CATALOG as Record<string, { label: string }>)[params.slug]
  return { title: cat ? `${cat.label} — plantilla` : "Plantilla" }
}

export default async function TemplateEditorPage({
  params,
}: {
  params: { slug: string }
}) {
  const session = await requireStudioAuth()
  const slug = params.slug as TemplateSlug
  const catalog = TEMPLATE_CATALOG[slug]
  if (!catalog) notFound()

  const [tpl, unread] = await Promise.all([
    getStudioTemplate(session.studioId, slug),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Plantillas de email"
        title={catalog.label}
        description={catalog.description}
        unreadNotifications={unread}
        actions={
          <Link
            href="/settings/emails/templates"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver
          </Link>
        }
      />

      <div className="px-6 py-6 lg:px-8">
        <TemplateEditor
          slug={slug}
          catalog={catalog}
          initialTemplate={
            tpl
              ? {
                  subject: tpl.subject,
                  body_html: tpl.body_html,
                  from_name: tpl.from_name,
                  reply_to: tpl.reply_to,
                  is_active: tpl.is_active,
                }
              : null
          }
        />
      </div>
    </>
  )
}
