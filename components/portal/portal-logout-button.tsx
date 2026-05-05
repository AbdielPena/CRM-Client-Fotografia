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
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
