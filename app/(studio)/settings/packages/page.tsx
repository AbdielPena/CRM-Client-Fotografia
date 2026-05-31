import { requireStudioAuth } from "@/server/middleware/auth"
import { getPackages } from "@/server/services/package.service"
import { getContractTemplates } from "@/server/services/contract.service"
import { listFormTemplates } from "@/server/services/form.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { PackageManager } from "@/components/settings/package-manager"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Paquetes" }

export default async function PackagesSettingsPage() {
  const session = await requireStudioAuth()

  // Queries en paralelo. studioSlug ya viene en `session` (poblado
  // por requireStudioAuth desde la tabla studios).
  const [packages, unread, contractTemplates, formTemplates] = await Promise.all([
    getPackages(session.studioId),
    countUnreadNotifications(session.studioId),
    getContractTemplates(session.studioId).catch(() => []),
    listFormTemplates(session.studioId).catch(() => []),
  ])
  const studioSlug = session.studioSlug

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Paquetes"
        description="Define los paquetes de servicios que ofreces a tus clientes"
        unreadNotifications={unread}
      />
      <div className="p-6">
        <PackageManager
          studioSlug={studioSlug}
          contractTemplates={(contractTemplates as Array<{ id: string; name: string }>).map(
            (t) => ({ id: t.id, name: t.name }),
          )}
          formTemplates={(formTemplates as Array<{ id: string; name: string }>).map(
            (t) => ({ id: t.id, name: t.name }),
          )}
          packages={(packages as Array<{
            id: string
            name: string
            slug: string
            description: string | null
            price: number | string
            currency: string
            duration_hours: number | null
            edited_photos: number | null
            includes: string[] | null
            is_active: boolean
            default_contract_template_id: string | null
            default_form_template_id: string | null
          }>).map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description ?? undefined,
            price: Number(p.price),
            currency: p.currency,
            durationHours: p.duration_hours ?? undefined,
            editedPhotos: p.edited_photos ?? undefined,
            includes: p.includes ? p.includes.join("\n") : undefined,
            isActive: p.is_active,
            contractTemplateId: p.default_contract_template_id ?? undefined,
            formTemplateId: p.default_form_template_id ?? undefined,
          }))}
        />
      </div>
    </>
  )
}
