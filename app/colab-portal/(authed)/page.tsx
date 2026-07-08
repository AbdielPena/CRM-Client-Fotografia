import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  CalendarClock,
  Wallet,
  CheckCircle2,
  Clock3,
  MapPin,
  User2,
  BadgeCheck,
} from "lucide-react"

import {
  COLAB_COOKIE_NAME,
  parseColabCookieValue,
} from "@/server/services/collaborator-portal.service"
import {
  getCollaboratorDashboard,
  type ColabJob,
  type ColabExtraPayment,
} from "@/server/services/collaborator-portal-data.service"
import { JobActions } from "./job-actions"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function fmtDate(d: string | null): string {
  if (!d) return "Fecha por definir"
  const [y, m, day] = d.slice(0, 10).split("-").map(Number)
  if (!y || !m || !day) return d
  return `${day} ${MONTHS[m - 1]} ${y}`
}

function fmtTime(t: string | null): string | null {
  if (!t) return null
  const [hh, mm] = t.slice(0, 5).split(":").map(Number)
  if (Number.isNaN(hh)) return null
  const ampm = hh >= 12 ? "p.m." : "a.m."
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`
}

function money(n: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n || 0)
}

const CONCEPT_LABEL: Record<string, string> = {
  bono: "Bono",
  ajuste: "Ajuste",
  reembolso: "Reembolso",
  extraordinario: "Pago extraordinario",
  otro: "Otro",
}

function Badge({ tone, children }: { tone: "amber" | "emerald" | "red" | "slate" | "blue"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    slate: "bg-muted text-muted-foreground",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

function confirmBadge(status: string) {
  if (status === "confirmed") return <Badge tone="emerald">Confirmado</Badge>
  if (status === "rejected") return <Badge tone="red">Rechazado</Badge>
  if (status === "completed") return <Badge tone="blue">Completado</Badge>
  return <Badge tone="amber">Por confirmar</Badge>
}

function payBadge(status: string) {
  if (status === "paid") return <Badge tone="emerald">Pagado</Badge>
  if (status === "cancelled") return <Badge tone="slate">Cancelado</Badge>
  return <Badge tone="amber">Pago pendiente</Badge>
}

function JobCard({ job }: { job: ColabJob }) {
  const time = fmtTime(job.time)
  const canRespond = job.confirmStatus === "pending" || job.confirmStatus === "invited"
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-foreground">{job.projectName}</p>
          {job.clientName && (
            <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
              <User2 className="h-3.5 w-3.5" /> {job.clientName}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">{confirmBadge(job.confirmStatus)}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" /> {fmtDate(job.date)}
          {time ? ` · ${time}` : ""}
        </span>
        {job.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {job.location}
          </span>
        )}
        {job.role && (
          <span className="inline-flex items-center gap-1">
            <BadgeCheck className="h-3.5 w-3.5" /> {job.role}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{money(job.agreedPay)}</span>
          {payBadge(job.payStatus)}
          {job.payStatus === "paid" && job.paidAt && (
            <span className="text-[11px] text-muted-foreground">· {fmtDate(job.paidAt)}</span>
          )}
        </div>
        {canRespond && <JobActions assignmentId={job.id} />}
      </div>
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: "brand" | "emerald" | "amber"
}) {
  const ring =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-brand"
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 ${ring}`}>
        {icon}
      </div>
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[19px] font-bold tracking-tight text-foreground">{value}</p>
    </div>
  )
}

export default async function ColabDashboardPage() {
  const session = parseColabCookieValue(cookies().get(COLAB_COOKIE_NAME)?.value)
  if (!session) redirect("/colab-portal/login")

  const { jobs, extras, totals } = await getCollaboratorDashboard(
    session.studioId,
    session.collaboratorId,
  )

  const upcoming = jobs
    .filter((j) => !j.isPast && j.confirmStatus !== "rejected")
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
  const past = jobs.filter((j) => j.isPast || j.confirmStatus === "rejected")

  // Historial de pagos: trabajos pagados + todos los pagos adicionales.
  const paidJobs = jobs.filter((j) => j.payStatus === "paid")
  const hasPaymentHistory = paidJobs.length > 0 || extras.length > 0

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[20px] font-bold tracking-tight text-foreground">Mi panel</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Tus trabajos, tu agenda y tus pagos en un solo lugar.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Wallet className="h-4 w-4" />}
          label="Por cobrar"
          value={money(totals.pendingTotal)}
          accent="amber"
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Recibido"
          value={money(totals.paidTotal)}
          accent="emerald"
        />
        <Kpi
          icon={<CalendarClock className="h-4 w-4" />}
          label="Próximos"
          value={String(totals.jobsUpcoming)}
          accent="brand"
        />
        <Kpi
          icon={<Clock3 className="h-4 w-4" />}
          label="Realizados"
          value={String(totals.jobsDone)}
          accent="brand"
        />
      </div>

      {/* Próximos trabajos / agenda */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-foreground">Próximos trabajos</h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-[13px] text-muted-foreground">
            No tienes trabajos próximos por ahora.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </section>

      {/* Trabajos realizados */}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-foreground">Trabajos realizados</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {past.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </section>
      )}

      {/* Historial de pagos */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-foreground">Historial de pagos</h2>
        {!hasPaymentHistory ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-[13px] text-muted-foreground">
            Aún no hay pagos registrados.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50 text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Concepto</th>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Método</th>
                  <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paidJobs.map((j) => (
                  <tr key={`j-${j.id}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-foreground">{j.projectName}</span>
                      {j.clientName ? (
                        <span className="text-muted-foreground"> · {j.clientName}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(j.paidAt ?? j.date)}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                      {j.paymentMethod ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                      {money(j.agreedPay)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{payBadge(j.payStatus)}</td>
                  </tr>
                ))}
                {extras.map((e: ColabExtraPayment) => (
                  <tr key={`e-${e.id}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-foreground">
                        {CONCEPT_LABEL[e.concept] ?? "Pago"}
                      </span>
                      {e.description ? (
                        <span className="text-muted-foreground"> · {e.description}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(e.paidAt ?? e.date)}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                      {e.method ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">{money(e.amount)}</td>
                    <td className="px-4 py-2.5 text-right">{payBadge(e.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Los pagos los registra tu estudio. Aquí solo puedes consultarlos.
        </p>
      </section>
    </div>
  )
}
