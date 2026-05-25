import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireRole } from "@/server/middleware/auth"
import { getPlanById } from "@/server/services/billing.service"
import { untypedServer } from "@/server/supabase/untyped"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { PlanEditForm } from "./plan-edit-form"

export const metadata: Metadata = { title: "Editar plan · Admin" }

export default async function EditPlanPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireRole("admin")

  const sb = untypedServer()
  const { data: isPlatformAdmin } = await sb
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", session.userId)
    .maybeSingle()

  if (!isPlatformAdmin) notFound()

  const isNew = params.id === "new"
  const plan = isNew ? null : await getPlanById(params.id)
  if (!isNew && !plan) notFound()

  return (
    <>
      <AppTopbar
        eyebrow="Platform admin / Planes"
        title={isNew ? "Nuevo plan" : `Editar ${plan?.name}`}
        description="Cambios aplican inmediatamente. Studios con suscripción activa mantienen su precio actual hasta el próximo renewal."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/billing/plans">
              <ArrowLeft className="mr-1 size-3.5" />
              Volver
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <PlanEditForm plan={plan} />
      </div>
    </>
  )
}
