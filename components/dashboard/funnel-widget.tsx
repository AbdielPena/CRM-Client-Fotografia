"use client"

import { motion } from "framer-motion"
import { Inbox, CheckCircle2, FileSignature, BadgeDollarSign } from "lucide-react"

type Funnel = {
  received: number
  approved: number
  contracted: number
  paid: number
  conversionPct: number
}

type Props = {
  data: Funnel
}

const STAGES = [
  {
    key: "received",
    label: "Solicitudes",
    icon: Inbox,
    // Each stage gets a progressively deeper aurora color via HSL tokens
    color: "hsl(240 84% 74%)",
  },
  {
    key: "approved",
    label: "Aprobadas",
    icon: CheckCircle2,
    color: "hsl(250 84% 68%)",
  },
  {
    key: "contracted",
    label: "Contratos firmados",
    icon: FileSignature,
    color: "hsl(262 83% 60%)",
  },
  {
    key: "paid",
    label: "Pagadas",
    icon: BadgeDollarSign,
    color: "hsl(282 84% 56%)",
  },
] as const

export function FunnelWidget({ data }: Props) {
  const max = Math.max(1, data.received, data.approved, data.contracted, data.paid)

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">
            Conversión este mes
          </p>
          <p className="font-display text-[2rem] leading-none tabular-nums text-foreground">
            {data.conversionPct}%
          </p>
        </div>
        <p className="text-caption text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {data.paid}
          </span>{" "}
          de{" "}
          <span className="font-medium text-foreground tabular-nums">
            {data.received}
          </span>{" "}
          solicitudes
        </p>
      </div>

      <div className="space-y-3">
        {STAGES.map((stage, idx) => {
          const value = data[stage.key]
          const pct = (value / max) * 100
          const Icon = stage.icon
          return (
            <div key={stage.key}>
              <div className="mb-1.5 flex items-center justify-between text-caption">
                <div className="flex items-center gap-1.5 text-foreground">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{stage.label}</span>
                </div>
                <span className="font-semibold text-foreground tabular-nums">
                  {value}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
                  transition={{
                    duration: 0.7,
                    delay: 0.08 * idx,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: stage.color,
                    boxShadow: value > 0 ? `0 0 12px -2px ${stage.color}66` : undefined,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
