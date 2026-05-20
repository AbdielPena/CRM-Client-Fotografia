"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, SkipForward, Loader2 } from "lucide-react"

import {
  markStepCompletedAction,
  skipStepAction,
} from "@/server/actions/onboarding.actions"
import { Button } from "@/components/ui/button"

export function OnboardingStepActions({ stepKey }: { stepKey: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState<"completed" | "skipped" | null>(null)

  async function handleComplete() {
    startTransition(async () => {
      const res = await markStepCompletedAction(stepKey)
      if (res.ok) {
        setDone("completed")
        router.refresh()
      }
    })
  }

  async function handleSkip() {
    startTransition(async () => {
      const res = await skipStepAction(stepKey)
      if (res.ok) {
        setDone("skipped")
        router.refresh()
      }
    })
  }

  if (done) {
    return (
      <span className="text-xs text-muted-foreground">
        {done === "completed" ? "✓ Marcado" : "⏭ Saltado"}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        onClick={handleComplete}
        disabled={isPending}
        size="sm"
        variant="ghost"
        title="Marcar como hecho"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
      </Button>
      <Button
        onClick={handleSkip}
        disabled={isPending}
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        title="No aplica / saltar"
      >
        <SkipForward className="size-3.5" />
      </Button>
    </div>
  )
}
