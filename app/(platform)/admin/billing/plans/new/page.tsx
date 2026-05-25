import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireRole } from "@/server/middleware/auth"
import { untypedServer } from "@/server/supabase/untyped"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { PlanEditForm } from "../[id]/plan-edit-form"

export const metadata: Metadata = { title: "Nuevo plan · Admin" }

export default async function NewPlanPage() {
  const session = await requireRole("admin")

  const sb = untypedServer()
  const { data: isPlatformAdmin } = await sb
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", session.userId)
    .maybeSingle()

  if (!isPlatformAdmin) notFound()

  return (
    <>
      <AppTopbar
        eyebrow="Platform admin / Planes"
        title="Nuevo plan"
        description="Configura el plan. Después conecta Stripe price IDs antes de exponerlo al público."
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
        <PlanEditForm plan={null} />
      </div>
    </>
  )
}
