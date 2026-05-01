"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { formatCurrency } from "@/lib/utils/currency"

type Bucket = {
  month: string
  label: string
  revenue: number
  paymentsCount: number
}

type Props = {
  buckets: Bucket[]
  currency?: string
}

/**
 * Revenue bar chart — SVG puro, sin deps externas.
 * - Usa tokens semánticos (HSL vars) vía style fill para soportar dark mode.
 * - Animación de entrada: las barras crecen de abajo hacia arriba en cascada.
 * - Hover: highlight brand + tooltip flotante.
 */
export function RevenueBarChart({ buckets, currency = "DOP" }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const { max, total, avg } = useMemo(() => {
    const values = buckets.map((b) => b.revenue)
    const m = Math.max(1, ...values)
    const t = values.reduce((s, v) => s + v, 0)
    const a = values.length > 0 ? t / values.length : 0
    return { max: m, total: t, avg: a }
  }, [buckets])

  if (buckets.length === 0) {
    return (
      <div className="py-10 text-center text-caption text-muted-foreground">
        Sin datos de ingresos todavía.
      </div>
    )
  }

  const W = 600
  const H = 200
  const padX = 8
  const padBottom = 28
  const barGap = 8
  const barW = (W - padX * 2 - barGap * (buckets.length - 1)) / buckets.length
  const plotH = H - padBottom

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">
            Total últimos {buckets.length} meses
          </p>
          <p className="font-display text-[2rem] leading-none tabular-nums text-foreground">
            {formatCurrency(total, currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-caption text-muted-foreground">Promedio mensual</p>
          <p className="text-body-sm font-medium text-foreground tabular-nums">
            {formatCurrency(avg, currency)}
          </p>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-48 w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.95" />
              <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id="bar-gradient-current" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(292 84% 60%)" stopOpacity="1" />
              <stop offset="100%" stopColor="hsl(262 83% 58%)" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          <line
            x1={padX}
            x2={W - padX}
            y1={plotH}
            y2={plotH}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />

          {buckets.map((b, i) => {
            const x = padX + i * (barW + barGap)
            const h = (b.revenue / max) * (plotH - 10)
            const y = plotH - h
            const isHover = hoverIdx === i
            const isCurrent = i === buckets.length - 1
            const gradientId = isCurrent ? "bar-gradient-current" : "bar-gradient"

            return (
              <g
                key={b.month}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: "pointer" }}
              >
                <motion.rect
                  initial={{ height: 0, y: plotH - 2 }}
                  animate={{
                    height: b.revenue > 0 ? h : 2,
                    y: b.revenue > 0 ? y : plotH - 2,
                  }}
                  transition={{
                    duration: 0.6,
                    delay: i * 0.04,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                  x={x}
                  width={barW}
                  rx={4}
                  fill={`url(#${gradientId})`}
                  opacity={isHover ? 1 : b.revenue > 0 ? 0.9 : 0.3}
                  style={{
                    filter: isHover
                      ? "drop-shadow(0 4px 12px hsl(var(--brand) / 0.35))"
                      : undefined,
                    transition: "opacity 180ms, filter 180ms",
                  }}
                />
                {/* full-height hitbox */}
                <rect
                  x={x}
                  y={0}
                  width={barW}
                  height={plotH}
                  fill="transparent"
                />
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fill="hsl(var(--muted-foreground))"
                  style={{ fontSize: 10, fontWeight: isCurrent ? 600 : 400 }}
                >
                  {b.label}
                </text>
              </g>
            )
          })}
        </svg>

        {hoverIdx !== null && buckets[hoverIdx] && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute rounded-md border border-border bg-popover px-2.5 py-1.5 text-caption shadow-lg"
            style={{
              left: `${((padX + hoverIdx * (barW + barGap) + barW / 2) / W) * 100}%`,
              top: 0,
              transform: "translate(-50%, -100%)",
              whiteSpace: "nowrap",
            }}
          >
            <div className="font-semibold text-popover-foreground tabular-nums">
              {formatCurrency(buckets[hoverIdx].revenue, currency)}
            </div>
            <div className="text-muted-foreground">
              {buckets[hoverIdx].paymentsCount} pago
              {buckets[hoverIdx].paymentsCount === 1 ? "" : "s"} ·{" "}
              {buckets[hoverIdx].label}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
