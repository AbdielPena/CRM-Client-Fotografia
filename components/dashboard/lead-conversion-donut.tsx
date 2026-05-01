"use client"

import { motion } from "framer-motion"
import { Users } from "lucide-react"

type LeadConversion = {
  total: number
  won: number
  lost: number
  pct: number
}

type Props = {
  data: LeadConversion
}

export function LeadConversionDonut({ data }: Props) {
  if (data.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Users className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-body-sm text-muted-foreground">Sin leads todavía</p>
      </div>
    )
  }

  const size = 160
  const stroke = 16
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const wonPct = data.pct / 100
  const wonLen = c * wonPct
  const open = data.total - data.won - data.lost

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient
              id="donut-aurora"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0%" stopColor="hsl(240 84% 64%)" />
              <stop offset="50%" stopColor="hsl(262 83% 58%)" />
              <stop offset="100%" stopColor="hsl(292 84% 60%)" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
          />
          <motion.circle
            initial={{ strokeDasharray: `0 ${c}` }}
            animate={{ strokeDasharray: `${wonLen} ${c}` }}
            transition={{ duration: 1.1, ease: [0.32, 0.72, 0, 1] }}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#donut-aurora)"
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 8px hsl(var(--brand) / 0.4))" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[2rem] leading-none tabular-nums text-foreground">
            {data.pct}%
          </span>
          <span className="mt-0.5 text-overline font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Conversión
          </span>
        </div>
      </div>

      <dl className="flex-1 space-y-2.5 text-caption">
        <LegendRow color="hsl(var(--brand))" label="Ganados" value={data.won} />
        <LegendRow color="hsl(var(--danger))" label="Perdidos" value={data.lost} />
        <LegendRow
          color="hsl(var(--border-strong))"
          label="En curso"
          value={open}
        />
        <div className="flex items-center justify-between border-t border-border pt-2">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-semibold text-foreground tabular-nums">
            {data.total}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: number
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-foreground">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </dt>
      <dd className="font-medium text-foreground tabular-nums">{value}</dd>
    </div>
  )
}
