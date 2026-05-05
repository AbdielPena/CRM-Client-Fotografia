"use client"

import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils/cn"

export type GoalTone = "blue" | "emerald" | "violet" | "amber" | "rose"

const TONE_BAR: Record<GoalTone, string> = {
  blue: "bg-brand",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
}

export interface Goal {
  label: string
  value: number // 0..100
  tone?: GoalTone
  /** Texto auxiliar opcional (ej: "$1,234 / $5,000") */
  hint?: string
}

interface GoalsProgressProps {
  goals: Goal[]
  className?: string
}

export function GoalsProgress({ goals, className }: GoalsProgressProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {goals.map((g, i) => (
        <div key={g.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium text-foreground">{g.label}</p>
            <p className="text-[12.5px] font-semibold tabular-nums text-foreground">
              {Math.round(g.value)}%
            </p>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, g.value))}%` }}
              transition={{
                duration: 0.9,
                delay: 0.15 + i * 0.08,
                ease: [0.32, 0.72, 0, 1],
              }}
              className={cn("absolute inset-y-0 left-0 rounded-full", TONE_BAR[g.tone ?? "blue"])}
            />
          </div>
          {g.hint && (
            <p className="text-[11.5px] text-muted-foreground tabular-nums">
              {g.hint}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
