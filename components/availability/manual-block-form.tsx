"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import { addManualBlockAction } from "@/server/actions/availability.actions"

export function ManualBlockForm() {
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    startTransition(async () => {
      const res = await addManualBlockAction(null, fd)
      if (res.ok) {
        toast.success("Bloqueo agregado")
        form.reset()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Bloquear tiempo manual
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Tiempo personal, reuniones, u otros compromisos
        </p>
      </div>

      <div>
        <label className="text-xs text-gray-600">Título</label>
        <input
          type="text"
          name="title"
          required
          placeholder="Ej: Cita médica"
          className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600">Tipo</label>
          <select
            name="blockType"
            defaultValue="manual"
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
          >
            <option value="manual">Manual</option>
            <option value="personal">Personal</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600">Fecha inicio</label>
          <input
            type="date"
            name="startDate"
            required
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">Fecha fin (opcional)</label>
          <input
            type="date"
            name="endDate"
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600">Hora inicio (opcional)</label>
          <input
            type="time"
            name="startTime"
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">Hora fin (opcional)</label>
          <input
            type="time"
            name="endTime"
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-600">Notas</label>
        <input
          type="text"
          name="notes"
          placeholder="Opcional"
          className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-900 focus:ring-0 outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        <Plus className="h-4 w-4" />
        {isPending ? "Agregando..." : "Agregar bloque"}
      </button>
    </form>
  )
}
