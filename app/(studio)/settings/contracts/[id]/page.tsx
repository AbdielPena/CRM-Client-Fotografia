import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { requireStudioAuth } from "@/server/middleware/auth"
import { getContractTemplateById } from "@/server/services/contract.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { ContractTemplateEditor } from "@/components/settings/contract-template-editor"

export const metadata: Metadata = { title: "Editar plantilla de contrato" }

export default async function EditContractTemplatePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const [template, unread] = await Promise.all([
    getContractTemplateById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!template) notFound()

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title={template.name}
        description="Edita el contenido, placeholders o validez"
        unreadNotifications={unread}
        actions={
          <Link
            href="/settings/contracts"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        }
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-4xl">
        <ContractTemplateEditor
          mode="edit"
          templateId={template.id}
          initial={{
            name: template.name,
            description: template.description ?? "",
            bodyHtml: template.body_html ?? "",
            isDefault: template.is_default,
            isActive: template.is_active,
            defaultValidityDays: template.default_validity_days,
          }}
        />
      </div>
    </>
  )
}
