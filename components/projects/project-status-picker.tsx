"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { setProjectStatusAction } from "@/server/actions/project-status.actions"
import { cn } from "@/lib/utils/cn"

type Status = {
  id: string
  label: string
  color: string
  position: number
}

interface ProjectStatusPickerProps {
  projectId: string
  currentStatus: string
  statuses: Status[]
  /** Si true, muestra solo el badge (compacto para la tarjeta) */
  compact?: boolean
}

export function ProjectStatusPicker({
  projectId,
  currentStatus,
  statuses,
  compact = false,
}: ProjectStatusPickerProps) {
  const [open, setOpen] = useState(false)
  const [optimistic, setOptimistic] = useState(currentStatus)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  const current = statuses.find((s) => s.label === optimistic) ??
    statuses.find((s) => s.label === currentStatus) ?? {
      id: "fallback",
      label: optimistic || currentStatus,
      color: "#94a3b8",
      position: 0,
    }

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const handleSelect = (label: string) => {
    if (label === optimistic) { setOpen(false); return }
    setOpen(false)
    setOptimistic(label)
    startTransition(async () => {
      const res = await setProjectStatusAction(projectId, label)
      if (res.error) setOptimistic(currentStatus) // revert on error
    })
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.preventDefault()}>
      {/* Trigger badge */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-semibold transition-all",
          "border border-transparent hover:border-black/10",
          compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
          isPending && "opacity-60",
        )}
        style={{
          backgroundColor: current.color + "22",
          color: current.color,
        }}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span
            className="h-1.5 w-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: current.color }}
          />
        )}
        {current.label}
        <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-border bg-popover p-1 shadow-xl"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cambiar estado
          </p>
          {statuses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s.label)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 text-foreground">{s.label}</span>
              {s.label === optimistic && (
                <Check className="h-3.5 w-3.5 text-brand" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
