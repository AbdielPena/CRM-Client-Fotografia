import Link from "next/link"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { FormTemplateEditor } from "@/components/settings/form-template-editor"

export const metadata: Metadata = { title: "Nueva plantilla" }

export default async function NewFormTemplatePage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Nueva plantilla de formulario"
        description="Diseña los campos que el cliente verá"
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
      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <FormTemplateEditor
          mode="create"
          initial={{
            name: "",
            description: "",
            isActive: true,
            isDefault: false,
            schema: {
              version: 1,
              fields: [
                {
                  key: "nombre_festejada",
                  label: "Nombre de la festejada",
                  type: "text",
                  required: true,
                },
                {
                  key: "fecha_evento",
                  label: "Fecha del evento",
                  type: "date",
                  required: true,
                },
                {
                  key: "locacion",
                  label: "Locación del evento",
                  type: "text",
                  placeholder: "Salón, iglesia, etc.",
                },
              ],
            },
          }}
        />
      </div>
    </>
  )
}
