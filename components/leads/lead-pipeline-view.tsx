"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Plus } from "lucide-react"

import { StatusBadge } from "@/components/shared/status-badge"
import { formatCurrency } from "@/lib/utils/currency"
import { cn } from "@/lib/utils/cn"

interface Stage {
  key: string
  label: string
}

type LeadCard = {
  id: string
  name: string
  email?: string | null
  event_type?: string | null
  budget?: number | string | null
  currency?: string | null
}

interface LeadPipelineViewProps {
  grouped: Record<string, LeadCard[]>
  stages: Stage[]
}

/**
 * Pipeline view (Kanban) — columnas por stage con total de valor y cards
 * discretas. Tokenizado, dark-mode ready, con entrada animada por columna.
 */
export function LeadPipelineView({ grouped, stages }: LeadPipelineViewProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 520 }}>
      {stages.map((stage, i) => {
        const leads = grouped[stage.key] ?? []
        const total = leads.reduce(
          (sum, l) => sum + (l.budget ? Number(l.budget) : 0),
          0,
        )

        return (
          <motion.div
            key={stage.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.32, 0.72, 0, 1],
              delay: i * 0.04,
            }}
            className="flex w-72 flex-shrink-0 flex-col rounded-xl border border-border bg-muted/30"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <StatusBadge status={stage.key} withDot />
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {leads.length}
                </span>
              </div>
              {total > 0 && (
                <span className="whitespace-nowrap text-caption font-semibold tabular-nums text-foreground">
                  {formatCurrency(total)}
                </span>
              )}
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {leads.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-caption text-muted-foreground">
                    Sin leads
                  </p>
                </div>
              ) : (
                leads.map((lead, idx) => (
                  <motion.div
                    key={lead.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.22,
                      ease: [0.32, 0.72, 0, 1],
                      delay: i * 0.04 + idx * 0.015,
                    }}
                  >
                    <Link
                      href={`/leads/${lead.id}`}
                      className={cn(
                        "block rounded-lg border border-border bg-card p-3 shadow-xs",
                        "transition-all duration-fast hover:-translate-y-px hover:border-brand/40 hover:shadow-md",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
                      )}
                    >
                      <p className="truncate text-body-sm font-semibold text-foreground">
                        {lead.name}
                      </p>
                      {lead.email && (
                        <p className="mt-0.5 truncate text-caption text-muted-foreground">
                          {lead.email}
                        </p>
                      )}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        {lead.event_type && (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                            {lead.event_type}
                          </span>
                        )}
                        {lead.budget && (
                          <span className="ml-auto text-caption font-semibold tabular-nums text-foreground">
                            {formatCurrency(
                              Number(lead.budget),
                              lead.currency ?? "DOP",
                            )}
                          </span>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                ))
              )}
            </div>

            {/* Footer CTA */}
            <div className="px-3 pb-3">
              <Link
                href={`/leads/new?status=${stage.key}`}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-2 text-caption font-medium text-muted-foreground",
                  "transition-colors duration-fast hover:border-brand/40 hover:bg-background hover:text-brand",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir lead
              </Link>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
