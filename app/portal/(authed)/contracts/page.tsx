import { cookies } from "next/headers"
import Link from "next/link"
import { FileText, Pen, Printer } from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatDateShort } from "@/lib/utils/currency"

export const dynamic = "force-dynamic"

export default async function PortalContractsPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()
  // Proyectos del cliente → contratos
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("client_id", session.clientId)
  const projectIds = (
    (projects ?? []) as Array<{ id: string }>
  ).map((p) => p.id)

  const { data: contractsRaw } =
    projectIds.length > 0
      ? await supabase
          .from("contracts")
          .select(
            "id, title, status, signed_at, sent_at, signing_token, expires_at, created_at",
          )
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = (contractsRaw ?? []) as any[]

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Tus contratos
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Acá podés revisar y firmar los contratos que te envió tu fotógrafo.
        </p>
      </header>

      {contracts.length === 0 ? (
        <Empty
          icon={<FileText className="mx-auto h-8 w-8 text-zinc-400" />}
          msg="Sin contratos todavía."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {contracts.map((c) => {
              const canSign =
                c.signing_token &&
                c.status !== "signed" &&
                (!c.expires_at || new Date(c.expires_at).getTime() > Date.now())
              return (
                <li key={c.id} className="flex items-center gap-4 px-5 py-4">
                  <FileText className="h-5 w-5 flex-shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {c.title}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      {c.signed_at
                        ? `Firmado ${formatDateShort(new Date(c.signed_at))}`
                        : c.sent_at
                          ? `Enviado ${formatDateShort(new Date(c.sent_at))}`
                          : `Creado ${formatDateShort(new Date(c.created_at))}`}
                    </p>
                  </div>
                  <StatusBadge status={String(c.status)} />
                  <Link
                    href={`/contract-print/${c.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    <Printer className="h-3 w-3" />
                    PDF
                  </Link>
                  {canSign && (
                    <Link
                      href={`/sign/${c.signing_token}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                    >
                      <Pen className="h-3 w-3" />
                      Firmar
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function Empty({ icon, msg }: { icon: React.ReactNode; msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      {icon}
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{msg}</p>
    </div>
  )
}
