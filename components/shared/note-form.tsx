"use client"

import { useState, useTransition } from "react"
import { createNoteAction } from "@/server/actions/note.actions"
import { Send } from "lucide-react"

interface NoteFormProps {
  entityType: "lead" | "client" | "project"
  entityId: string
}

export function NoteForm({ entityType, entityId }: NoteFormProps) {
  const [content, setContent] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    setError("")
    startTransition(async () => {
      const result = await createNoteAction({ content: content.trim(), entityType, entityId })
      if (result?.error) {
        setError(typeof result.error === "string" ? result.error : "Error al guardar la nota")
      } else {
        setContent("")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escribe una nota interna..."
        rows={2}
        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }
        }}
      />
      <button
        type="submit"
        disabled={isPending || !content.trim()}
        className="px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 self-end"
        title="Guardar nota (Cmd+Enter)"
      >
        <Send className="h-4 w-4" />
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </form>
  )
}
