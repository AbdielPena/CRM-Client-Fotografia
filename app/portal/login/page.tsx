import type { Metadata } from "next"

import { PortalLoginForm } from "@/components/portal/portal-login-form"

export const metadata: Metadata = { title: "Portal del cliente" }
export const dynamic = "force-dynamic"

export default function PortalLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Portal del cliente
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Ingresá con el email y el código que te envió tu fotógrafo.
        </p>
        <PortalLoginForm />
      </div>
    </div>
  )
}
