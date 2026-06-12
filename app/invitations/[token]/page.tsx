import Link from "next/link"
import { ArrowRight, AlertCircle, Mail } from "lucide-react"
import type { Metadata } from "next"

import { untypedServer } from "@/server/supabase/untyped"
import { createSupabaseServerClient } from "@/server/supabase/server"

import { Button } from "@/components/ui/button"

import { AcceptButton } from "./accept-button"

export const metadata: Metadata = { title: "Invitación · PixelOS" }

export default async function InvitationAcceptPage({
  params,
}: {
  params: { token: string }
}) {
  const sb = untypedServer()
  const { data: inv } = await sb
    .from("studio_invitations")
    .select(
      `*,
       studio:studios(id, name)`,
    )
    .eq("token", params.token)
    .maybeSingle()

  type InvWithStudio = {
    id: string
    email: string
    role: string
    status: string
    expires_at: string
    message: string | null
    studio?: { id: string; name: string } | { id: string; name: string }[] | null
  } | null

  const invitation = inv as InvWithStudio

  // Check si el user actual está logueado
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!invitation) {
    return <ErrorState message="Invitación no encontrada" />
  }

  if (invitation.status === "accepted") {
    return <ErrorState message="Esta invitación ya fue aceptada" />
  }
  if (invitation.status === "revoked") {
    return <ErrorState message="Esta invitación fue revocada" />
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return <ErrorState message="Esta invitación expiró" />
  }

  const studio = Array.isArray(invitation.studio)
    ? invitation.studio[0]
    : invitation.studio

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-8">
      <div className="sf-card w-full p-6">
        <div className="mb-4 flex justify-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="size-7" />
          </span>
        </div>

        <h1 className="text-center text-xl font-bold">
          Invitación a unirte a {studio?.name ?? "un estudio"}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Te invitaron como <strong>{invitation.role}</strong> al equipo.
        </p>

        {invitation.message && (
          <div className="mt-4 rounded-xl border border-input bg-muted/30 p-3 text-sm italic">
            "{invitation.message}"
          </div>
        )}

        <div className="mt-6 space-y-3">
          {user ? (
            user.email?.toLowerCase() === invitation.email.toLowerCase() ? (
              <AcceptButton token={params.token} />
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <AlertCircle className="mr-1 inline size-4" />
                Esta invitación es para <strong>{invitation.email}</strong>,
                pero estás logueado como <strong>{user.email}</strong>.
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                >
                  <Link href="/api/auth/logout">Cerrar sesión</Link>
                </Button>
              </div>
            )
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Para aceptar, primero{" "}
                <Link
                  href={`/login?redirect=/invitations/${params.token}`}
                  className="font-semibold text-primary hover:underline"
                >
                  inicia sesión
                </Link>{" "}
                con el email <strong>{invitation.email}</strong>.
              </p>
              <p className="text-xs text-muted-foreground">
                ¿No tienes cuenta?{" "}
                <Link
                  href={`/register?email=${encodeURIComponent(invitation.email)}&redirect=/invitations/${params.token}`}
                  className="font-semibold text-primary hover:underline"
                >
                  Regístrate
                </Link>
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[10px] text-muted-foreground">
        Powered by PixelOS
      </p>
    </main>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-8">
      <div className="sf-card w-full p-6 text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
          <AlertCircle className="size-7" />
        </span>
        <h1 className="mt-4 text-xl font-bold">Invitación inválida</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button asChild className="mt-6">
          <Link href="/">
            Ir al inicio
            <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>
    </main>
  )
}
