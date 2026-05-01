import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { requireStudioAuth } from "@/server/middleware/auth"
import { formTemplatesRepo, packagesRepo } from "@/server/repositories"
import { listPackagesLinkedToTemplate } from "@/server/services/form.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { FormTemplateEditor } from "@/components/settings/form-template-editor"
import { FormTemplatePackages } from "@/components/settings/form-template-packages"
import type { FormSchema } from "@/lib/forms/types"

export const metadata: Metadata = { title: "Editar plantilla" }

export default async function EditFormTemplatePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const template = await formTemplatesRepo.findById(params.id)

  if (!template || template.studio_id !== session.studioId || template.deleted_at) {
    notFound()
  }

  const schema = (template.schema as unknown as FormSchema | null) ?? {
    version: 1,
    fields: [],
  }

  const [packages, linkedIds, unread] = await Promise.all([
    packagesRepo.listActive(session.studioId),
    listPackagesLinkedToTemplate({
      studioId: session.studioId,
      templateId: template.id,
    }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title={template.name}
        description="Edita los campos de esta plantilla"
        unreadNotifications={unread}
        actions={
          <Link
            href="/settings/forms"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        }
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-4xl space-y-6">
        <FormTemplateEditor
          mode="edit"
          templateId={template.id}
          initial={{
            name: template.name,
            description: template.description ?? "",
            isActive: template.is_active,
            isDefault: template.is_default,
            schema,
          }}
        />
        <FormTemplatePackages
          templateId={template.id}
          packages={(packages as Array<{ id: string; name: string; is_active: boolean }>).map(
            (p) => ({
              id: p.id,
              name: p.name,
              isActive: p.is_active,
            }),
          )}
          initialSelectedIds={linkedIds}
        />
      </div>
    </>
  )
}
