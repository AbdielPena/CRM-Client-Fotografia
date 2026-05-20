"use client"

import Link from "next/link"
import { Rocket, ArrowRight, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useState } from "react"

export function OnboardingBanner({
  percentage,
  completed,
  total,
}: {
  percentage: number
  completed: number
  total: number
}) {
  const [hidden, setHidden] = useState(false)

  if (hidden || percentage >= 100) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-5"
      >
        <button
          onClick={() => setHidden(true)}
          className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-accent"
          aria-label="Ocultar"
        >
          <X className="size-3.5" />
        </button>

        <div className="flex items-start gap-4">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Rocket className="size-5" />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-bold">
              Continúa configurando tu estudio
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {completed} de {total} pasos completados — sigue donde lo
              dejaste.
            </p>

            {/* Progress bar */}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>

            <Link
              href="/onboarding"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Continuar onboarding
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
