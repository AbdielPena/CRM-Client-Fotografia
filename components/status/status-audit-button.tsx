"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { runAuditAction } from "@/server/actions/status.actions"

export function StatusAuditButton() {
  const router = useRouter()
  const [isPending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        start(async () => {
          const r = (await runAuditAction()) as {
            success?: boolean
            summary?: { ok: number; warning: number; error: number }
          }
          if (r?.success && r.summary) {
            toast.success(
              `Auditoría completa — ${r.summary.ok} OK · ${r.summary.warning} advertencias · ${r.summary.error} errores`,
            )
            router.refresh()
          } else {
            toast.error("No se pudo ejecutar la auditoría")
          }
        })
      }
      className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Ejecutando auditoría…" : "Ejecutar auditoría"}
    </button>
  )
}
