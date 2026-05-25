import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { TemplateForm } from "../[id]/template-form"

export const metadata: Metadata = { title: "Nueva plantilla" }

export default async function NewTemplatePage() {
  await requireStudioAuth()

  return (
    <>
      <AppTopbar
        eyebrow="Plantillas de proyecto"
        title="Nueva plantilla"
        description="Define el workflow reutilizable: tasks, emails, deliverables."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/project-templates">
              <ArrowLeft className="mr-1 size-3.5" />
              Volver
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <TemplateForm template={null} />
      </div>
    </>
  )
}
