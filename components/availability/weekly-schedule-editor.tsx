"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, Save } from "lucide-react"
import { toast } from "sonner"

import { saveWeeklyScheduleAction } from "@/server/actions/availability.actions"
import type { AvailabilityRule } from "@/server/repositories"

type DaySchedule = {
  dayOfWeek: number
  open: boolean
  windows: Array<{ startTime: string; endTime: string }>
}

const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
]

function buildInitialSchedule(rules: AvailabilityRule[]): DaySchedule[] {
  const schedule: DaySchedule[] = DAY_NAMES.map((_, i) => ({
    dayOfWeek: i,
    open: false,
    windows: [],
  }))

  for (const rule of rules) {
    if (rule.day_of_week === null || rule.day_of_week === undefined) continue
    const day = schedule[rule.day_of_week]
    if (!day) continue

    if (rule.rule_type === "weekly_closed") {
      day.open = false
      day.windows = []
    } else if (rule.rule_type === "weekly_open") {
      day.open = true
      if (rule.start_time && rule.end_time) {
        day.windows.push({
          startTime: rule.start_time.slice(0, 5),
          endTime: rule.end_time.slice(0, 5),
        })
      }
    }
  }

  // Default: si no hay ninguna rule, sugerir L–V 09–18
  const hasAny = schedule.some((d) => d.open || d.windows.length > 0)
  if (!hasAny) {
    for (let i = 1; i <= 5; i++) {
      schedule[i]!.open = true
      schedule[i]!.windows = [{ startTime: "09:00", endTime: "18:00" }]
    }
  }

  return schedule
}

export function WeeklyScheduleEditor({
  initialRules,
}: {
  initialRules: AvailabilityRule[]
}) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(() =>
    buildInitialSchedule(initialRules),
  )
  const [isPending, startTransition] = useTransition()

  const updateDay = (index: number, patch: Partial<DaySchedule>) => {
    setSchedule((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    )
  }

  const addWindow = (index: number) => {
    setSchedule((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              open: true,
              windows: [
                ...d.windows,
                { startTime: "09:00", endTime: "18:00" },
              ],
            }
          : d,
      ),
    )
  }

  const removeWindow = (dayIndex: number, windowIndex: number) => {
    setSchedule((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              windows: d.windows.filter((_, w) => w !== windowIndex),
            }
          : d,
      ),
    )
  }

  const updateWindow = (
    dayIndex: number,
    windowIndex: number,
    field: "startTime" | "endTime",
    value: string,
  ) => {
    setSchedule((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              windows: d.windows.map((w, wi) =>
                wi === windowIndex ? { ...w, [field]: value } : w,
              ),
            }
          : d,
      ),
    )
  }

  const handleSave = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("schedule", JSON.stringify(schedule))
      const res = await saveWeeklyScheduleAction(null, fd)
      if (res.ok) {
        toast.success("Horario semanal guardado")
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Horario semanal
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define tus días y horas disponibles por defecto
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {schedule.map((day, i) => (
          <div key={day.dayOfWeek} className="px-5 py-4 flex items-start gap-4">
            <div className="w-28 flex-shrink-0 pt-1">
              <span className="text-sm font-medium text-foreground">
                {DAY_NAMES[day.dayOfWeek]}
              </span>
            </div>

            <label className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={day.open}
                onChange={(e) =>
                  updateDay(i, {
                    open: e.target.checked,
                    windows:
                      e.target.checked && day.windows.length === 0
                        ? [{ startTime: "09:00", endTime: "18:00" }]
                        : day.windows,
                  })
                }
                className="h-4 w-4 rounded border-border-strong text-foreground focus:ring-gray-900"
              />
              <span className="text-xs text-muted-foreground">
                {day.open ? "Abierto" : "Cerrado"}
              </span>
            </label>

            <div className="flex-1 space-y-2">
              {day.open &&
                day.windows.map((win, wi) => (
                  <div key={wi} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={win.startTime}
                      onChange={(e) =>
                        updateWindow(i, wi, "startTime", e.target.value)
                      }
                      className="px-3 py-1.5 border border-border rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
                    />
                    <span className="text-xs text-muted-foreground">—</span>
                    <input
                      type="time"
                      value={win.endTime}
                      onChange={(e) =>
                        updateWindow(i, wi, "endTime", e.target.value)
                      }
                      className="px-3 py-1.5 border border-border rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeWindow(i, wi)}
                      className="p-1.5 text-muted-foreground hover:text-danger transition-colors"
                      aria-label="Eliminar franja"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              {day.open && (
                <button
                  type="button"
                  onClick={() => addWindow(i)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Agregar franja
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
