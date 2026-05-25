import type { Metadata } from "next"
import { ShieldCheck, Key } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { get2FAStatus } from "@/server/services/user-2fa.service"

import { AppTopbar } from "@/components/layout/app-topbar"

import { TotpManager } from "./totp-manager"

export const metadata: Metadata = { title: "Seguridad · 2FA" }

export default async function SecurityPage() {
  const session = await requireStudioAuth()

  const [status, unread] = await Promise.all([
    get2FAStatus(session.userId).catch(() => null),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Seguridad"
        description="Autenticación de dos factores (TOTP) + recovery codes."
        unreadNotifications={unread}
      />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <TotpManager
          status={status}
          userEmail={session.email}
          studioName={session.studioName ?? "StudioFlow"}
        />

        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="mr-1 inline size-3.5" />
            Sobre 2FA TOTP
          </h3>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li>
              <strong>TOTP</strong> = Time-based One-Time Password. Compatible
              con Google Authenticator, 1Password, Authy, Microsoft
              Authenticator y cualquier app que soporte el estándar RFC 6238.
            </li>
            <li>
              <strong>Recovery codes</strong>: 10 códigos single-use que
              puedes guardar offline. Te permiten acceder si pierdes tu
              dispositivo.
            </li>
            <li>
              <strong>Algoritmo</strong>: HMAC-SHA1, 6 dígitos, periodo 30s.
            </li>
            <li>
              Para desactivar 2FA, necesitas tu código TOTP actual o un
              recovery code (verifica identidad).
            </li>
          </ul>
        </section>
      </main>
    </>
  )
}
