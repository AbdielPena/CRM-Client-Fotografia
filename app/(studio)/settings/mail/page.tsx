import {
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  Star,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getMailAccounts } from "@/server/services/mail-account.service"
import { formatDateShort } from "@/lib/utils/currency"

import { NewMailAccountForm } from "./new-mail-account-form"

export const metadata: Metadata = { title: "Configuración · Correo" }

export default async function MailSettingsPage() {
  const session = await requireStudioAuth()
  const [accounts, unread] = await Promise.all([
    getMailAccounts(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Cuentas de correo"
        description="Conecta tus cuentas Mailcow para sincronizar inbox y enviar emails desde el monolito."
        unreadNotifications={unread}
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6 lg:px-8">
        {/* Lista de cuentas existentes */}
        <section className="sf-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl">Cuentas registradas</h2>
              <p className="text-xs text-muted-foreground">
                Sincronización automática c/5 minutos vía cron Edge Function.
              </p>
            </div>
          </div>

          {accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
              <Mail className="mx-auto mb-2 size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">Sin cuentas Mailcow registradas</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Agrega tu primera cuenta abajo. Validaremos las credenciales
                antes de guardarlas.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {accounts.map((acc) => (
                <li
                  key={acc.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="size-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {acc.email}
                      </p>
                      {acc.is_default && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <Star className="size-2.5 fill-current" />
                          Default
                        </span>
                      )}
                    </div>
                    {acc.display_name && (
                      <p className="text-xs text-muted-foreground">
                        {acc.display_name}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span>IMAP: {acc.imap_host}:{acc.imap_port}</span>
                      <span>SMTP: {acc.smtp_host}:{acc.smtp_port}</span>
                      {acc.last_synced_at ? (
                        <span>
                          Última sync: {formatDateShort(new Date(acc.last_synced_at))}
                        </span>
                      ) : (
                        <span>Sin sync aún</span>
                      )}
                      {acc.last_uid_synced != null && (
                        <span>UID: {acc.last_uid_synced}</span>
                      )}
                    </div>

                    {acc.last_error && (
                      <p className="mt-2 flex items-start gap-1.5 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700 dark:bg-red-950 dark:text-red-300">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        {acc.last_error}
                      </p>
                    )}
                  </div>

                  <SyncStatusBadge status={acc.sync_status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Form para agregar nueva cuenta */}
        <section className="sf-card p-6">
          <h2 className="font-display text-xl">Conectar nueva cuenta</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Antes de guardar, probamos la conexión IMAP + SMTP. Si falla, NO se
            persiste — corrige las credenciales y reintenta.
          </p>
          <NewMailAccountForm hasExistingDefault={accounts.some((a) => a.is_default)} />
        </section>

        {/* Info técnica */}
        <section className="rounded-xl border border-border bg-muted/30 p-4 text-[11px] text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Sobre el módulo Mail</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Sync IMAP polling c/5 minutos vía cron (no IMAP IDLE en serverless).
              Cap 100 mensajes por run.
            </li>
            <li>
              Threading RFC 5322: agrupación por <code>Message-ID</code> / <code>In-Reply-To</code>{" "}
              / <code>References</code>.
            </li>
            <li>
              Attachments se suben a Supabase Storage bucket <code>mail-attachments</code>{" "}
              (privado, RLS por studio).
            </li>
            <li>
              Outbound vía SMTP con DKIM/SPF de Mailcow ya configurado server-side.
            </li>
            <li>
              Passwords cifrados en columna <code>*_password_secret_id</code> con prefijo{" "}
              <code>v1:</code> (MVP — V2 migrará a Supabase Vault).
            </li>
          </ul>
        </section>
      </div>
    </>
  )
}

function SyncStatusBadge({ status }: { status: string }) {
  if (status === "ok") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle2 className="size-3" />
        OK
      </span>
    )
  }
  if (status === "syncing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        <Loader2 className="size-3 animate-spin" />
        Sincronizando
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
        <XCircle className="size-3" />
        Error
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      Inactiva
    </span>
  )
}
