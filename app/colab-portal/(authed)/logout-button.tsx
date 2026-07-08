"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

export function ColabLogoutButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/colab-portal/logout", { method: "POST" })
        router.push("/colab-portal/login")
        router.refresh()
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <LogOut className="h-3.5 w-3.5" /> Salir
    </button>
  )
}
