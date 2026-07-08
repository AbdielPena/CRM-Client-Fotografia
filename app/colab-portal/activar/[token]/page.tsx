import Link from "next/link"

import { getSetupByToken } from "@/server/services/collaborator-portal.service"
import { ActivarForm } from "./activar-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Activar portal del colaborador" }

export default async function ActivarPage({ params }: { params: { token: string } }) {
  const setup = await getSetupByToken(params.token)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Activa tu portal</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Crea tu contraseña para entrar cuando quieras.
          </p>
        </div>

        {setup ? (
          <ActivarForm token={params.token} name={setup.name} email={setup.email} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
            <p className="text-[13.5px] font-semibold text-foreground">Enlace inválido o vencido</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Pídele a tu estudio que te envíe un nuevo enlace de activación.
            </p>
            <Link
              href="/colab-portal/login"
              className="mt-4 inline-block text-[12.5px] font-medium text-brand hover:underline"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
