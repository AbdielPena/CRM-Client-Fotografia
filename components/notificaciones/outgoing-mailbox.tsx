"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ChevronRight,
  Users,
  Settings2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Mail,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"

// Tipos estructurales (la fuente es server-only; aquí solo el subconjunto que usa la UI).
type Item = {
  id: string
  subject: string
  status: string
  templateLabel: string | null
  toName: string | null
  toEmail: string
  category: string
  sentAt: string | null
  createdAt: string
  lastError: string | null
}
type Session = {
  projectId: string | null
  projectName: string | null
  eventDate: string | null
  items: Item[]
}
type Client = {
  key: string
  clientName: string
  clientEmail: string
  total: number
  lastAt: string
  sessions: Session[]
}
type SysGroup = { category: string; label: string; items: Item[] }

const CAT_LABELS: Record<string, string> = {
  engagement: "Engagement",
  gallery: "Galerías",
  delivery: "Entregas",
  contract: "Contratos",
  invoice: "Facturas",
  booking: "Reservas",
  client: "Clientes",
  otros: "Otros",
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("es-DO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
function fmtDay(s: string): string {
  // date-only ("YYYY-MM-DD") → mediodía para evitar corrimiento de zona horaria.
  return new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function StatusBadge({ status }: { status: string }) {
  if (status === "sent")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Enviado
      </span>
    )
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
        <AlertCircle className="h-3 w-3" /> Falló
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
      <Clock className="h-3 w-3" /> Pendiente
    </span>
  )
}

function EmailRow({ n, showRecipient }: { n: Item; showRecipient?: boolean }) {
  return (
    <Link
      href={`/notificaciones/${n.id}`}
      className="flex items-center gap-4 border-t border-border px-4 py-2.5 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[12.5px] font-medium text-foreground">{n.subject}</p>
          <StatusBadge status={n.status} />
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {showRecipient ? `Para: ${n.toName ? `${n.toName} · ` : ""}${n.toEmail}` : null}
          {showRecipient && n.templateLabel ? " — " : ""}
          {n.templateLabel ?? (showRecipient ? "" : "—")}
        </p>
        {n.status === "failed" && n.lastError && (
          <p className="mt-0.5 truncate text-[11px] text-rose-500">{n.lastError}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {CAT_LABELS[n.category] ?? n.category}
        </span>
        <p className="mt-1 text-[10.5px] tabular-nums text-muted-foreground">
          {fmtDateTime(n.sentAt ?? n.createdAt)}
        </p>
      </div>
    </Link>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={cn(
        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
        open && "rotate-90",
      )}
    />
  )
}

export function OutgoingMailbox({
  clients,
  system,
  clientCount,
  systemCount,
}: {
  clients: Client[]
  system: SysGroup[]
  clientCount: number
  systemCount: number
}) {
  const [view, setView] = useState<"clientes" | "sistema">("clientes")
  const [openClients, setOpenClients] = useState<Set<string>>(new Set())
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const allClientKeys = useMemo(() => clients.map((c) => c.key), [clients])
  const allGroupKeys = useMemo(() => system.map((g) => g.category), [system])

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  const expandAll = () => {
    if (view === "clientes") {
      setOpenClients(new Set(allClientKeys))
      setCollapsedSessions(new Set())
    } else {
      setOpenGroups(new Set(allGroupKeys))
    }
  }
  const collapseAll = () => {
    if (view === "clientes") setOpenClients(new Set())
    else setOpenGroups(new Set())
  }

  return (
    <div className="space-y-4">
      {/* Tabs Clientes / Del sistema */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button
            onClick={() => setView("clientes")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              view === "clientes"
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-card text-muted-foreground hover:border-border-strong",
            )}
          >
            <Users className="h-3.5 w-3.5" /> Clientes
            <span
              className={cn(
                "rounded-full px-1.5 text-[10.5px] tabular-nums",
                view === "clientes" ? "bg-white/20" : "bg-muted",
              )}
            >
              {clientCount}
            </span>
          </button>
          <button
            onClick={() => setView("sistema")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              view === "sistema"
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-card text-muted-foreground hover:border-border-strong",
            )}
          >
            <Settings2 className="h-3.5 w-3.5" /> Del sistema
            <span
              className={cn(
                "rounded-full px-1.5 text-[10.5px] tabular-nums",
                view === "sistema" ? "bg-white/20" : "bg-muted",
              )}
            >
              {systemCount}
            </span>
          </button>
        </div>
        <div className="flex gap-1.5 text-[12px]">
          <button
            onClick={expandAll}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-muted-foreground hover:border-border-strong"
          >
            Expandir todo
          </button>
          <button
            onClick={collapseAll}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-muted-foreground hover:border-border-strong"
          >
            Colapsar todo
          </button>
        </div>
      </div>

      {/* ── Vista Clientes ── */}
      {view === "clientes" &&
        (clients.length === 0 ? (
          <Empty text="Aún no hay correos enviados a clientes." />
        ) : (
          <div className="space-y-2">
            {clients.map((c) => {
              const open = openClients.has(c.key)
              return (
                <div
                  key={c.key}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <button
                    onClick={() => setOpenClients((s) => toggle(s, c.key))}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <Chevron open={open} />
                    <Users className="h-4 w-4 shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-foreground">
                        {c.clientName}
                      </p>
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {c.clientEmail}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                        {c.total} {c.total === 1 ? "correo" : "correos"}
                      </span>
                      <p className="mt-1 text-[10.5px] text-muted-foreground">
                        último {fmtDateTime(c.lastAt)}
                      </p>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-border bg-muted/20 px-2 pb-2 pt-1">
                      {c.sessions.map((s, i) => {
                        const sKey = `${c.key}::${s.projectId ?? "none"}::${i}`
                        const sOpen = !collapsedSessions.has(sKey)
                        return (
                          <div
                            key={sKey}
                            className="mt-1 overflow-hidden rounded-lg border border-border bg-card"
                          >
                            <button
                              onClick={() => setCollapsedSessions((set) => toggle(set, sKey))}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                            >
                              <Chevron open={sOpen} />
                              <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                                {s.projectName ?? "Sin sesión específica"}
                                {s.eventDate && (
                                  <span className="ml-2 font-normal text-muted-foreground">
                                    · {fmtDay(s.eventDate)}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                                {s.items.length}
                              </span>
                            </button>
                            {sOpen && (
                              <div>
                                {s.items.map((n) => (
                                  <EmailRow key={n.id} n={n} />
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

      {/* ── Vista Del sistema ── */}
      {view === "sistema" &&
        (system.length === 0 ? (
          <Empty text="No hay correos del sistema." />
        ) : (
          <div className="space-y-2">
            {system.map((g) => {
              const open = openGroups.has(g.category)
              return (
                <div
                  key={g.category}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <button
                    onClick={() => setOpenGroups((s) => toggle(s, g.category))}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <Chevron open={open} />
                    <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                      {g.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {g.items.length} {g.items.length === 1 ? "correo" : "correos"}
                    </span>
                  </button>
                  {open && (
                    <div>
                      {g.items.map((n) => (
                        <EmailRow key={n.id} n={n} showRecipient />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <Mail className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
