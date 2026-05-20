"use client"

import { useState, useTransition } from "react"
import {
  Key,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
} from "lucide-react"

import {
  createApiTokenAction,
  revokeApiTokenAction,
} from "@/server/actions/api-token.actions"
import type { ApiTokenRow } from "@/server/services/api-token.service"
import { Button } from "@/components/ui/button"

export function ApiTokensManager({
  tokens,
  canCreate,
}: {
  tokens: ApiTokenRow[]
  canCreate: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createApiTokenAction(formData)
      if (res.ok && res.plaintext) {
        setNewToken(res.plaintext)
        setShowCreate(false)
      } else {
        setFeedback(res.message ?? "Error")
      }
    })
  }

  async function handleRevoke(tokenId: string) {
    if (!window.confirm("¿Revocar este token? La acción es irreversible.")) return
    startTransition(async () => {
      const res = await revokeApiTokenAction(tokenId)
      setFeedback(res.ok ? "Token revocado" : res.message ?? "Error")
      if (res.ok) window.location.reload()
    })
  }

  function copyToken() {
    if (!newToken) return
    navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Modal: token recién creado */}
      {newToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-base font-bold">Token creado</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Guárdalo ahora — no podrás verlo de nuevo.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
                {newToken}
              </code>
              <Button
                onClick={copyToken}
                size="sm"
                variant="outline"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="mr-1 size-3.5 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 size-3.5" />
                    Copiar
                  </>
                )}
              </Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => {
                  setNewToken(null)
                  setCopied(false)
                  window.location.reload()
                }}
                size="sm"
              >
                Cerrar y ver lista
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="sf-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Key className="mr-1 inline size-3.5" />
            Tokens activos ({tokens.filter((t) => t.is_active).length})
          </h3>
          {canCreate && (
            <Button
              onClick={() => setShowCreate(!showCreate)}
              size="sm"
              variant={showCreate ? "outline" : "default"}
            >
              {showCreate ? "Cancelar" : (
                <>
                  <Plus className="mr-1 size-3.5" />
                  Nuevo token
                </>
              )}
            </Button>
          )}
        </div>

        {feedback && (
          <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        {showCreate && canCreate && (
          <form action={handleCreate} className="mb-4 space-y-3 rounded-xl border border-input bg-muted/30 p-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="Ej. n8n integration"
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Scopes
              </label>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="scopes"
                    value="read"
                    defaultChecked
                    className="rounded border-input"
                  />
                  Read (solo GET)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="scopes"
                    value="write"
                    className="rounded border-input"
                  />
                  Write (POST, PUT, DELETE)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="scopes"
                    value="admin"
                    className="rounded border-input"
                  />
                  Admin (todo, incluso settings)
                </label>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Expira (opcional)
              </label>
              <input
                type="date"
                name="expiresAt"
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1 size-3.5" />
              )}
              Generar token
            </Button>
          </form>
        )}

        {tokens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-input p-6 text-center text-xs text-muted-foreground">
            {canCreate ? (
              "Sin tokens. Crea uno para empezar a usar la API."
            ) : (
              <>
                <Lock className="mr-1 inline size-3" />
                Upgrade a plan Studio para crear tokens.
              </>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {t.name}
                    {!t.is_active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                        <AlertCircle className="size-2.5" />
                        Revocado
                      </span>
                    )}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <code className="font-mono">{t.token_prefix}</code>
                    <span>·</span>
                    <span>Scopes: {t.scopes.join(", ")}</span>
                    <span>·</span>
                    <span>{t.usage_count} usos</span>
                    {t.last_used_at && (
                      <>
                        <span>·</span>
                        <span>Último uso: {formatRelativeDate(t.last_used_at)}</span>
                      </>
                    )}
                  </div>
                </div>
                {t.is_active && (
                  <Button
                    onClick={() => handleRevoke(t.id)}
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <Trash2 className="mr-1 size-3" />
                    Revocar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "hoy"
  if (days === 1) return "ayer"
  if (days < 30) return `hace ${days}d`
  return d.toLocaleDateString()
}
