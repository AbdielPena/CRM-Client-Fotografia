"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { CalendarDays } from "lucide-react"

import { cn } from "@/lib/utils/cn"

type UpcomingProject = {
  id: string
  name: string
  status: string
  event_date: string | null
  event_time: string | null
  client: { name?: string } | Array<{ name?: string }> | null
}

interface Props {
  projects: UpcomingProject[]
}

const STATUS_STYLE: Record<string, string> = {
  booked: "bg-success-soft text-success",
  in_progress: "bg-warning-soft text-warning",
}

const STATUS_LABEL: Record<string, string> = {
  booked: "Confirmada",
  in_progress: "En proceso",
}

export function UpcomingSessions({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-5 w-5" />}
        title="Sin sesiones próximas"
        description="Cuando agendes tus primeras sesiones, aparecerán aquí."
      />
    )
  }

  return (
    <ul className="-mx-5 divide-y divide-border/60">
      {projects.map((p, idx) => {
        const date = p.event_date
          ? new Date(String(p.event_date).slice(0, 10) + "T00:00:00")
          : null
        const clientName = Array.isArray(p.client)
          ? p.client[0]?.name
          : (p.client as { name?: string } | null)?.name

        return (
          <motion.li
            key={p.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.32,
              delay: idx * 0.04,
              ease: [0.32, 0.72, 0, 1],
            }}
          >
            <Link
              href={`/projects/${p.id}`}
              title={`${clientName ?? "Sin cliente"}\n${p.name}${p.event_time ? `\n${String(p.event_time).slice(0, 5)}` : ""}\n${date ? date.toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long" }) : ""}`}
              className={cn(
                "flex items-center gap-3.5 px-5 py-3.5 transition-colors duration-fast",
                "hover:bg-muted/60",
              )}
            >
              <DateTile date={date} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-foreground">
                  {clientName ?? "Sin cliente"}
                </p>
                <p className="truncate text-caption text-muted-foreground">
                  {p.name}
                  {p.event_time && (
                    <>
                      {" · "}
                      <span className="tabular-nums">
                        {String(p.event_time).slice(0, 5)}
                      </span>
                    </>
                  )}
                </p>
              </div>

              <span
                className={cn(
                  "flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  STATUS_STYLE[p.status] ??
                    "bg-muted text-muted-foreground",
                )}
              >
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
            </Link>
          </motion.li>
        )
      })}
    </ul>
  )
}

function DateTile({ date }: { date: Date | null }) {
  return (
    <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-gradient-to-br from-muted/60 to-background">
      <span className="font-display text-body leading-none text-foreground">
        {date ? date.getDate() : "—"}
      </span>
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {date ? date.toLocaleString("es", { month: "short" }) : ""}
      </span>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-body-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-caption text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}
