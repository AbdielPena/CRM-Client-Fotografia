"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"

import { acceptInvitationAction } from "@/server/actions/studio-members.actions"
import { Button } from "@/components/ui/button"

export function AcceptButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    startTransition(async () => {
      const res = await acceptInvitationAction(token)
      if (!res.ok) {
        setError(res.message ?? "Error desconocido")
      }
      // Si OK, server action ya hizo redirect
    })
  }

  return (
    <>
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}
      <Button onClick={handleAccept} disabled={isPending} fullWidth size="lg">
        {isPending ? (
          <>
            <Loader2 className="mr-1 size-4 animate-spin" />
            Aceptando...
          </>
        ) : (
          <>
            <CheckCircle2 className="mr-1 size-4" />
            Aceptar invitación
          </>
        )}
      </Button>
    </>
  )
}
