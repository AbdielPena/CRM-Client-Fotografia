"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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
 * Revenue line chart — estilo Lumen: line + area shaded suave, grid sutil,
 * smooth curve (cardinal spline), tooltip on hover, draw-in animation.
 */
export function RevenueLineChart({ buckets, currency = "DOP" }: Props) {
  const router = useRouter()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const handleClick = (monthKey: string) => {
    // Navega al listado de facturas filtrado por ese mes
    router.push(`/invoices?month=${monthKey}`)
  }

  const { max, total, avg } = useMemo(() => {
    const values = buckets.map((b) => b.revenue)
    const m = Math.max(1, ...values)
    const t = values.reduce((s, v) => s + v, 0)
    const a = values.length > 0 ? t / values.length : 0
    return { max: m, total: t, avg: a }
  }, [buckets])

  if (buckets.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Sin datos de ingresos todavía.
      </div>
    )
  }

  const W = 800
  const H = 240
  const padX = 16
  const padTop = 16
  const padBottom = 28
  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom

  // Coordenadas
  const points = buckets.map((b, i) => {
    const x = padX + (i / Math.max(1, buckets.length - 1)) * plotW
    const y = padTop + (1 - b.revenue / max) * plotH
    return { x, y }
  })

  // Smooth path (cardinal spline approximation con quad bezier)
  const smoothPath = (() => {
    if (points.length < 2) return ""
    const path: string[] = [`M ${points[0]!.x} ${points[0]!.y}`]
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]!
      const p1 = points[i]!
      const p2 = points[i + 1]!
      const p3 = points[Math.min(points.length - 1, i + 2)]!
      const tension = 0.18
      const cp1x = p1.x + (p2.x - p0.x) * tension
      const cp1y = p1.y + (p2.y - p0.y) * tension
      const cp2x = p2.x - (p3.x - p1.x) * tension
      const cp2y = p2.y - (p3.y - p1.y) * tension
      path.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`)
    }
    return path.join(" ")
  })()

  const areaPath = `${smoothPath} L ${points.at(-1)!.x} ${padTop + plotH} L ${points[0]!.x} ${padTop + plotH} Z`

  // Grid horizontal (4 líneas)
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => padTop + t * plotH)

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] text-muted-foreground">
            Total últimos {buckets.length} meses
          </p>
          <p className="text-[28px] font-bold leading-tight tabular-nums tracking-tight text-foreground">
            {formatCurrency(total, currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-muted-foreground">Promedio mensual</p>
          <p className="text-[14px] font-semibold tabular-nums text-foreground">
            {formatCurrency(avg, currency)}
          </p>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[260px] w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="line-area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.18" />
              <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid horizontal */}
          {gridLines.map((y, i) => (
            <line
              key={i}
              x1={padX}
              x2={W - padX}
              y1={y}
              y2={y}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              strokeDasharray={i === gridLines.length - 1 ? "0" : "3 4"}
              opacity={i === gridLines.length - 1 ? 1 : 0.6}
            />
          ))}

          {/* Área debajo de la curva */}
          <motion.path
            d={areaPath}
            fill="url(#line-area-gradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          />

          {/* Curva principal */}
          <motion.path
            d={smoothPath}
            fill="none"
            stroke="hsl(var(--brand))"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: [0.32, 0.72, 0, 1] }}
          />

          {/* Dots por punto + hitbox */}
          {points.map((p, i) => {
            const b = buckets[i]!
            const isHover = hoverIdx === i
            return (
              <g key={b.month}>
                <motion.circle
                  cx={p.x}
                  cy={p.y}
                  r={isHover ? 5 : 0}
                  fill="hsl(var(--brand))"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  initial={{ r: 0 }}
                  animate={{ r: isHover ? 5 : 0 }}
                  transition={{ duration: 0.15 }}
                />
                {/* Hitbox vertical generosa con click → /invoices?month=YYYY-MM */}
                <rect
                  x={p.x - plotW / buckets.length / 2}
                  y={0}
                  width={plotW / buckets.length}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onClick={() => handleClick(b.month)}
                  style={{ cursor: b.revenue > 0 ? "pointer" : "default" }}
                  role={b.revenue > 0 ? "button" : undefined}
                  aria-label={
                    b.revenue > 0
                      ? `Ver facturas de ${b.label}: ${formatCurrency(b.revenue, currency)} en ${b.paymentsCount} pago${b.paymentsCount === 1 ? "" : "s"}`
                      : undefined
                  }
                />
                {/* Etiquetas X */}
                <text
                  x={p.x}
                  y={H - 8}
                  textAnchor="middle"
                  fill="hsl(var(--muted-foreground))"
                  style={{
                    fontSize: 11,
                    fontWeight: i === buckets.length - 1 ? 600 : 400,
                  }}
                >
                  {b.label}
                </text>
              </g>
            )
          })}

          {/* Línea vertical guía cuando hover */}
          {hoverIdx !== null && points[hoverIdx] && (
            <motion.line
              x1={points[hoverIdx]!.x}
              x2={points[hoverIdx]!.x}
              y1={padTop}
              y2={padTop + plotH}
              stroke="hsl(var(--brand))"
              strokeWidth={1}
              strokeDasharray="3 3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ duration: 0.12 }}
            />
          )}
        </svg>

        {/* Tooltip flotante con detalle + hint de click */}
        {hoverIdx !== null && buckets[hoverIdx] && points[hoverIdx] && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute z-10 min-w-[180px] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(points[hoverIdx]!.x / W) * 100}%`,
              top: `${(points[hoverIdx]!.y / H) * 100}%`,
              transform: "translate(-50%, calc(-100% - 12px))",
              whiteSpace: "nowrap",
            }}
          >
            <div className="font-semibold text-popover-foreground tabular-nums text-[13px]">
              {formatCurrency(buckets[hoverIdx]!.revenue, currency)}
            </div>
            <div className="mt-0.5 text-muted-foreground">
              {buckets[hoverIdx]!.paymentsCount} pago
              {buckets[hoverIdx]!.paymentsCount === 1 ? "" : "s"} ·{" "}
              {buckets[hoverIdx]!.label.charAt(0).toUpperCase() + buckets[hoverIdx]!.label.slice(1)}
            </div>
            {buckets[hoverIdx]!.revenue > 0 && (
              <div className="mt-1.5 border-t border-border pt-1.5 text-[10.5px] text-brand">
                Click para ver facturas →
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
