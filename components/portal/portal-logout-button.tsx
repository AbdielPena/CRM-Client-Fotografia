"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Loader2 } from "lucide-react"

export function PortalLogoutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const logout = () => {
    startTransition(async () => {
      await fetch("/api/portal/logout", { method: "POST" })
      router.push("/portal/login")
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-gold-300 hover:text-gold-700 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <LogOut className="h-3.5 w-3.5" />
      )}
      Salir
    </button>
  )
}
