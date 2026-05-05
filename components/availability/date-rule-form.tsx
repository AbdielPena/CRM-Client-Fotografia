"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CalendarX, CalendarCheck, Plus } from "lucide-react"

import { addDateRuleAction } from "@/server/actions/availability.actions"

export function DateRuleForm() {
  const [ruleType, setRuleType] = useState<"date_closed" | "date_open_override">(
    "date_closed",
  )
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set("ruleType", ruleType)
    startTransition(async () => {
      const res = await addDateRuleAction(null, fd)
      if (res.ok) {
        toast.success(
          ruleType === "date_closed"
            ? "Fecha cerrada agregada"
            : "Apertura excepcional agregada",
        )
        form.reset()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card rounded-xl border border-border p-5 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Agregar excepción de fecha
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Vacaciones, feriados o aperturas fuera del horario habitual
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRuleType("date_closed")}
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            ruleType === "date_closed"
              ? "border-red-300 bg-danger/10 text-danger"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <CalendarX className="h-4 w-4" />
          Cerrado
        </button>
        <button
          type="button"
          onClick={() => setRuleType("date_open_override")}
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            ruleType === "date_open_override"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <CalendarCheck className="h-4 w-4" />
          Abierto excepcional
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Desde</label>
          <input
            type="date"
            name="startDate"
            required
            className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            Hasta {ruleType === "date_closed" ? "(opcional)" : ""}
          </label>
          <input
            type="date"
            name="endDate"
            disabled={ruleType === "date_open_override"}
            className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
      </div>

      {ruleType === "date_open_override" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Hora inicio</label>
            <input
              type="time"
              name="startTime"
              required
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Hora fin</label>
            <input
              type="time"
              name="endTime"
              required
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
            />
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground">Notas (opcional)</label>
        <input
          type="text"
          name="notes"
          placeholder="Ej: Vacaciones navideñas"
          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-colors"
      >
        <Plus className="h-4 w-4" />
        {isPending ? "Agregando..." : "Agregar regla"}
      </button>
    </form>
  )
}
