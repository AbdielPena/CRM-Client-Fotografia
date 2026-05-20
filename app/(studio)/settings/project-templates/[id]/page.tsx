import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getProjectTemplateById } from "@/server/services/project-template.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { TemplateForm } from "./template-form"

export const metadata: Metadata = { title: "Editar plantilla" }

export default async function TemplateDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const template = await getProjectTemplateById(session.studioId, params.id)
  if (!template) notFound()

  return (
    <>
      <AppTopbar
        eyebrow="Plantillas de proyecto"
        title={`Editar ${template.name}`}
        description={`Usado ${template.usage_count} veces`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/project-templates">
              <ArrowLeft className="mr-1 size-3.5" />
              Lista
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <TemplateForm template={template} />
      </div>
    </>
  )
}
