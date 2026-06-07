import type { Metadata } from "next"
import { Sparkles } from "lucide-react"

import { PortalLoginForm } from "@/components/portal/portal-login-form"

export const metadata: Metadata = { title: "Portal del cliente" }
export const dynamic = "force-dynamic"

export default function PortalLoginPage() {
  return (
    <div className="client-luxe relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <div className="lx-card animate-fade-in-up p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-white shadow-luxe">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="lx-overline mb-2">Portal privado</p>
            <h1 className="font-serif text-2xl font-semibold text-foreground">
              Bienvenida de nuevo
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ingresa con el email y el código que te envió tu fotógrafo.
            </p>
          </div>
          <PortalLoginForm />
        </div>
        <p className="mt-5 text-center text-[11px] tracking-wide text-muted-foreground/60">
          Tu información, solo para ti.
        </p>
      </div>
    </div>
  )
}
