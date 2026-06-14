import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { listInquiryForms } from "@/server/services/inquiry-form.service"
import { getServiceCategories } from "@/server/services/service-category.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { InquiryFormManager } from "@/components/leads/inquiry-form-manager"

export const metadata: Metadata = { title: "Formularios de captación" }

export default async function InquiryFormsPage() {
  const session = await requireStudioAuth()

  const [forms, categories, unread] = await Promise.all([
    listInquiryForms(session.studioId),
    getServiceCategories(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    "https://my.abbypixel.com"

  return (
    <>
      <AppTopbar
        eyebrow="Leads"
        title="Formularios de captación"
        description="Crea formularios, pégalos en tu web por ID y los envíos entran como leads"
        unreadNotifications={unread}
      />
      <div className="p-6">
        <InquiryFormManager
          origin={origin}
          categories={categories.map((c) => c.name)}
          forms={forms.map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description,
            isActive: f.is_active,
            defaultCategory: f.default_category,
            submitLabel: f.submit_label,
            successMessage: f.success_message,
            fields: f.schema?.fields ?? [],
          }))}
        />
      </div>
    </>
  )
}
