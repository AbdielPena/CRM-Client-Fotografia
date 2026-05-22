"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Archive, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { archiveMailThreadAction } from "@/server/actions/mail-thread.actions"
import { Button } from "@/components/ui/button"

export function ThreadActions({ threadId }: { threadId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleArchive = () => {
    if (!confirm("¿Archivar esta conversación? Podrás restaurarla desde papelera.")) {
      return
    }
    startTransition(async () => {
      const result = await archiveMailThreadAction(threadId)
      if (result.ok) {
        toast.success(result.message ?? "Thread archivado")
        router.push("/mail/inbox")
      } else {
        toast.error(result.message ?? "Error desconocido")
      }
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleArchive}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="mr-1 size-3.5 animate-spin" />
      ) : (
        <Archive className="mr-1 size-3.5" />
      )}
      Archivar
    </Button>
  )
}
