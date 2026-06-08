"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Lock, Unlock, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { setPrintLockAction } from "@/server/actions/print.actions"

export function PrintLockToggle({
  galleryId,
  locked,
}: {
  galleryId: string
  locked: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const toggle = () =>
    start(async () => {
      const r = await setPrintLockAction(galleryId, !locked)
      if (r.ok) {
        toast.success(locked ? "Selección reabierta" : "Selección cerrada")
        router.refresh()
      } else {
        toast.error(r.message ?? "Error")
      }
    })

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border-strong disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : locked ? (
        <Unlock className="h-3.5 w-3.5" />
      ) : (
        <Lock className="h-3.5 w-3.5" />
      )}
      {locked ? "Reabrir selección" : "Cerrar selección"}
    </button>
  )
}
