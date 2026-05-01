"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { UserCheck } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { formatDateShort } from "@/lib/utils/currency"

type Lead = {
  id: string
  name: string
  status: string
  event_type: string | null
  created_at: string
}

interface Props {
  leads: Lead[]
}

const STATUS_LABEL: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  meeting_scheduled: "Reunión",
  proposal_sent: "Propuesta",
  negotiating: "Negociando",
  won: "Ganado",
  lost: "Perdido",
  archived: "Archivado",
}

const STATUS_STYLE: Record<string, string> = {
  new: "bg-info-soft text-info",
  contacted: "bg-warning-soft text-warning",
  meeting_scheduled: "bg-brand-soft text-brand-soft-foreground",
  proposal_sent: "bg-warning-soft text-warning",
  negotiating: "bg-brand-soft text-brand-soft-foreground",
  won: "bg-success-soft text-success",
  lost: "bg-danger-soft text-danger",
  archived: "bg-muted text-muted-foreground",
}

// 8 aurora gradient pairs for lead avatar variety
const AVATAR_GRADIENTS = [
  "from-[hsl(262,83%,60%)] to-[hsl(292,84%,60%)]",
  "from-[hsl(240,84%,64%)] to-[hsl(262,83%,58%)]",
  "from-[hsl(200,84%,60%)] to-[hsl(240,84%,64%)]",
  "from-[hsl(292,84%,60%)] to-[hsl(330,84%,60%)]",
  "from-[hsl(180,70%,50%)] to-[hsl(240,84%,64%)]",
  "from-[hsl(262,83%,60%)] to-[hsl(220,84%,60%)]",
  "from-[hsl(160,70%,50%)] to-[hsl(220,84%,60%)]",
  "from-[hsl(320,84%,60%)] to-[hsl(262,83%,60%)]",
]

function gradientFor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

export function RecentLeads({ leads }: Props) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserCheck className="h-5 w-5" />
        </div>
        <p className="text-body-sm font-medium text-foreground">
          Sin leads todavía
        </p>
        <Link
          href="/leads/new"
          className="mt-1 text-caption font-semibold text-brand hover:text-brand/80"
        >
          Crear primer lead →
        </Link>
      </div>
    )
  }

  return (
    <ul className="-mx-5 divide-y divide-border/60">
      {leads.map((lead, idx) => (
        <motion.li
          key={lead.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.32,
            delay: idx * 0.04,
            ease: [0.32, 0.72, 0, 1],
          }}
        >
          <Link
            href={`/leads/${lead.id}`}
            className={cn(
              "flex items-center gap-3.5 px-5 py-3.5 transition-colors duration-fast",
              "hover:bg-muted/60",
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-body-sm font-semibold text-white bg-gradient-to-br",
                gradientFor(lead.name),
              )}
            >
              {lead.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-foreground">
                {lead.name}
              </p>
              <p className="truncate text-caption text-muted-foreground">
                {lead.event_type ?? "Sin tipo"}{" · "}
                <span className="tabular-nums">
                  {formatDateShort(new Date(lead.created_at))}
                </span>
              </p>
            </div>
            <span
              className={cn(
                "flex-shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
                STATUS_STYLE[lead.status] ??
                  "bg-muted text-muted-foreground",
              )}
            >
              {STATUS_LABEL[lead.status] ?? lead.status}
            </span>
          </Link>
        </motion.li>
      ))}
    </ul>
  )
}
