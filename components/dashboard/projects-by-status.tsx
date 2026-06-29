"use client"

import { motion } from "framer-motion"
import { FolderOpen } from "lucide-react"

type Row = { status: string; count: number }

type Props = {
  rows: Row[]
}

// Cada status tiene un color HSL explícito (en vez de clase Tailwind fija)
// para que el look se mantenga consistente en light/dark.
const STATUS_META: Record<string, { label: string; color: string }> = {
  booked: { label: "Reservados", color: "hsl(var(--success))" },
  in_progress: { label: "En proceso", color: "hsl(var(--info))" },
  editing: { label: "En edición", color: "hsl(var(--brand))" },
  delivered: { label: "Entregados", color: "hsl(240 30% 55%)" },
  completed: { label: "Completados", color: "hsl(240 10% 30%)" },
  cancelled: { label: "Cancelados", color: "hsl(var(--danger))" },
  archived: { label: "Archivados", color: "hsl(var(--border-strong))" },
}

export function ProjectsByStatus({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-body-sm text-muted-foreground">
          Sin sesiones todavía
        </p>
      </div>
    )
  }

  const total = rows.reduce((s, r) => s + r.count, 0)

  const segments = rows.map((r) => {
    const meta =
      STATUS_META[r.status] ?? {
        label: r.status,
        color: "hsl(var(--muted-foreground))",
      }
    const pct = total > 0 ? (r.count / total) * 100 : 0
    return { ...r, meta, pct }
  })

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-caption text-muted-foreground">Total de sesiones</p>
        <p className="text-h3 font-semibold text-foreground tabular-nums">
          {total}
        </p>
      </div>

      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {segments.map((s, idx) => (
          <motion.div
            key={s.status}
            initial={{ width: 0 }}
            animate={{ width: `${s.pct}%` }}
            transition={{
              duration: 0.7,
              delay: idx * 0.06,
              ease: [0.32, 0.72, 0, 1],
            }}
            className="h-full"
            style={{ backgroundColor: s.meta.color }}
            title={`${s.meta.label}: ${s.count}`}
          />
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-caption">
        {segments.map((s) => (
          <div key={s.status} className="flex items-center justify-between">
            <dt className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: s.meta.color }}
              />
              <span className="truncate text-foreground">{s.meta.label}</span>
            </dt>
            <dd className="flex-shrink-0 font-semibold text-foreground tabular-nums">
              {s.count}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
