import { cookies } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  CalendarCheck,
  Clock,
  MapPin,
  Tag,
  Receipt,
  FileText,
  ClipboardList,
  Shirt,
} from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { getSessionPlanLabel } from "@/server/services/session-naming.service"
import { getDressPickerForClient } from "@/server/services/session-dress.service"
import { PortalDressPicker } from "@/components/portal/portal-dress-picker"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"
import { PortalHeader } from "@/components/portal/portal-ui"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

function fmtTime(t?: string | null): string | null {
  if (!t) return null
  const [hh, mm] = String(t).split(":")
  let h = parseInt(hh, 10)
  if (Number.isNaN(h)) return null
  const ampm = h >= 12 ? "PM" : "AM"
  h = h % 12 || 12
  return `${h}:${mm} ${ampm}`
}
function timeRange(start?: string | null, end?: string | null): string | null {
  const s = fmtTime(start)
  if (!s) return null
  const e = fmtTime(end)
  return e ? `${s} - ${e}` : s
}

export default async function PortalSessionDetailsPage({
  params,
}: {
  params: { projectId: string }
}) {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, event_type, event_date, event_time, event_end_time, location, package_id, status, dress_catalog_id, dress_name",
    )
    .eq("id", params.projectId)
    .eq("client_id", session.clientId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!project) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = project as any

  const plan = await getSessionPlanLabel(session.studioId, p.package_id)

  // Selección de vestido por el cliente (solo quinceañeras), sin precio.
  const isQuince = /quince|xv/i.test(String(p.event_type ?? ""))
  const dressStores = isQuince
    ? await getDressPickerForClient(session.studioId).catch(() => [])
    : []

  const [{ data: invoicesRaw }, { data: contractsRaw }, { data: formsRaw }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, status, total, amount_paid, currency, due_date, created_at",
        )
        .eq("project_id", p.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("contracts")
        .select(
          "id, title, status, signing_token, signed_at, sent_at, expires_at, created_at",
        )
        .eq("project_id", p.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("form_responses")
        .select("id, status, access_token, completed_at, template:form_templates(name)")
        .eq("project_id", p.id)
        .order("created_at", { ascending: true }),
    ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invoicesRaw ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = (contractsRaw ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forms = (formsRaw ?? []) as any[]

  const currency = invoices[0]?.currency ?? "DOP"
  const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0)
  const totalDue = invoices
    .filter((i) => i.status !== "paid" && i.status !== "void")
    .reduce(
      (s, i) => s + Math.max(0, Number(i.total ?? 0) - Number(i.amount_paid ?? 0)),
      0,
    )

  const d = p.event_date ? new Date(String(p.event_date).slice(0, 10) + "T00:00:00") : null
  const dateStr = d
    ? new Intl.DateTimeFormat("es", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d)
    : "Por confirmar"
  const time = timeRange(p.event_time, p.event_end_time)

  return (
    <div className="space-y-8">
      <PortalHeader
        eyebrow="Tu sesión"
        title="Detalles de la sesión"
        description={plan?.label ?? p.name}
        right={<StatusBadge status={String(p.status)} />}
      />

      {/* Datos de la sesión */}
      <Section icon={CalendarCheck} title="Datos de la sesión">
        <Row icon={Tag} label="Plan" value={plan?.label ?? p.name} />
        <Row icon={CalendarCheck} label="Fecha" value={cap(dateStr)} />
        {time && <Row icon={Clock} label="Hora" value={time} />}
        <Row icon={MapPin} label="Ubicación" value={p.location ?? "Por confirmar"} />
      </Section>

      {/* Tu vestido (solo quinceañeras) — el cliente elige; sin precio */}
      {isQuince && (
        <Section icon={Shirt} title="Tu vestido">
          <p className="mb-4 text-sm text-muted-foreground">
            Elige el vestido que deseas para tu sesión. Puedes cambiarlo cuando quieras.
          </p>
          <PortalDressPicker
            projectId={p.id}
            stores={dressStores}
            currentDressId={p.dress_catalog_id ?? null}
            currentDressName={p.dress_name ?? null}
          />
        </Section>
      )}

      {/* Pago */}
      <Section icon={Receipt} title="Pago">
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay facturas para esta sesión.
          </p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2.5">
              <Pill label="Pagado" value={formatCurrency(totalPaid, currency)} tone="success" />
              {totalDue > 0 && (
                <Pill label="Saldo" value={formatCurrency(totalDue, currency)} tone="warning" />
              )}
            </div>
            <div className="divide-y divide-border/50">
              {invoices.map((inv) => {
                const paid = inv.status === "paid"
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        {inv.invoice_number ?? "Factura"}
                      </p>
                      <p className="text-[12px] tabular-nums text-muted-foreground">
                        {formatCurrency(Number(inv.total ?? 0), inv.currency ?? currency)}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <StatusBadge status={String(inv.status)} />
                      <Link
                        href={`/i/${inv.id}`}
                        target="_blank"
                        className={paid ? linkPill : "lx-btn-gold !px-4 !py-1.5 text-xs"}
                      >
                        {paid ? "Ver recibo" : "Pagar"}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Section>

      {/* Documentos */}
      <Section icon={FileText} title="Documentos">
        {contracts.length === 0 && forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay documentos todavía.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {contracts.map((c) => {
              const signed = c.status === "signed"
              const canSign =
                c.signing_token &&
                !signed &&
                (!c.expires_at || new Date(c.expires_at).getTime() > Date.now())
              return (
                <DocRow
                  key={c.id}
                  icon={FileText}
                  title={c.title ?? "Contrato"}
                  subtitle={
                    signed
                      ? `Firmado ${formatDateShort(new Date(c.signed_at))}`
                      : "Pendiente de firma"
                  }
                  done={signed}
                  href={canSign ? `/sign/${c.signing_token}` : `/contract-print/${c.id}`}
                  cta={canSign ? "Firmar" : "Ver"}
                />
              )
            })}
            {forms.map((f) => {
              const done = f.status === "completed" || !!f.completed_at
              const name = Array.isArray(f.template)
                ? f.template[0]?.name
                : f.template?.name
              return (
                <DocRow
                  key={f.id}
                  icon={ClipboardList}
                  title={name ?? "Cuestionario"}
                  subtitle={done ? "Completado" : "Pendiente de completar"}
                  done={done}
                  href={`/f/${f.access_token}`}
                  cta={done ? "Ver" : "Completar"}
                />
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

const linkPill =
  "inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-gold-300 hover:text-gold-700"

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="lx-card animate-fade-in-up p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-gold-600">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-serif text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-600" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-[15px] text-foreground">{value}</p>
      </div>
    </div>
  )
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "success" | "warning"
}) {
  const tones = {
    success:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    warning:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  }
  return (
    <div className={`rounded-2xl px-4 py-2.5 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
        {label}
      </p>
      <p className="mt-0.5 font-serif-soft text-xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  )
}

function DocRow({
  icon: Icon,
  title,
  subtitle,
  done,
  href,
  cta,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  done: boolean
  href: string
  cta: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
            done
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-brand-soft text-gold-600"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Link href={href} target="_blank" className={`${linkPill} flex-shrink-0`}>
        {cta}
      </Link>
    </div>
  )
}
