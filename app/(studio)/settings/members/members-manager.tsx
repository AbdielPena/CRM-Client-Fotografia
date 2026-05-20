"use client"

import { useState, useTransition } from "react"
import {
  UserPlus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Trash2,
  RefreshCw,
  XCircle,
  Mail,
  Crown,
  Lock,
} from "lucide-react"

import {
  inviteMemberAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  updateMemberRoleAction,
} from "@/server/actions/studio-members.actions"
import type {
  StudioInvitation,
  StudioMember,
  StudioRole,
} from "@/server/services/studio-members.service"
import { Button } from "@/components/ui/button"

const ROLE_OPTIONS: Array<{ value: StudioRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
  { value: "finance", label: "Finance" },
  { value: "viewer", label: "Viewer" },
]

const ROLE_BADGE_CLS: Record<StudioRole, string> = {
  owner:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  staff: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  finance:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  viewer:
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
}

export function MembersManager({
  members,
  invitations,
  currentUserId,
  maxUsers,
}: {
  members: StudioMember[]
  invitations: StudioInvitation[]
  currentUserId: string
  maxUsers: number | null
}) {
  const [showInvite, setShowInvite] = useState(false)
  const [newInvitationLink, setNewInvitationLink] = useState<string | null>(
    null,
  )
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)

  const atLimit = maxUsers !== null && members.length >= maxUsers

  async function handleInvite(formData: FormData) {
    startTransition(async () => {
      const res = await inviteMemberAction(formData)
      if (res.ok && res.invitationLink) {
        setNewInvitationLink(res.invitationLink)
        setShowInvite(false)
        setFeedback({ type: "ok", msg: "Invitación creada" })
      } else {
        setFeedback({ type: "err", msg: res.message ?? "Error" })
      }
    })
  }

  async function handleRoleChange(userId: string, newRole: StudioRole) {
    startTransition(async () => {
      const res = await updateMemberRoleAction(userId, newRole)
      setFeedback({
        type: res.ok ? "ok" : "err",
        msg: res.ok ? "Rol actualizado" : res.message ?? "Error",
      })
      if (res.ok) window.location.reload()
    })
  }

  async function handleRemove(userId: string, name: string) {
    if (!window.confirm(`¿Eliminar a ${name} del studio?`)) return
    startTransition(async () => {
      const res = await removeMemberAction(userId)
      if (res.ok) window.location.reload()
      else setFeedback({ type: "err", msg: res.message ?? "Error" })
    })
  }

  async function handleResend(invitationId: string) {
    startTransition(async () => {
      const res = await resendInvitationAction(invitationId)
      setFeedback({
        type: res.ok ? "ok" : "err",
        msg: res.message ?? (res.ok ? "Reenviada" : "Error"),
      })
    })
  }

  async function handleRevoke(invitationId: string) {
    if (!window.confirm("¿Revocar invitación?")) return
    startTransition(async () => {
      const res = await revokeInvitationAction(invitationId)
      if (res.ok) window.location.reload()
      else setFeedback({ type: "err", msg: res.message ?? "Error" })
    })
  }

  function copyLink() {
    if (!newInvitationLink) return
    navigator.clipboard.writeText(newInvitationLink)
    setFeedback({ type: "ok", msg: "Link copiado" })
  }

  return (
    <>
      {/* Modal: invitation link recién creada */}
      {newInvitationLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-base font-bold">Invitación creada</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Copia y comparte este link con la persona (también recibirá un
              email cuando el sistema de mail esté integrado V2).
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
                {newInvitationLink}
              </code>
              <Button onClick={copyLink} size="sm" variant="outline">
                <Copy className="mr-1 size-3.5" />
                Copiar
              </Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => window.location.reload()}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm " +
            (feedback.type === "ok"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")
          }
        >
          {feedback.type === "ok" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          {feedback.msg}
        </div>
      )}

      {atLimit && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <span>
            <Lock className="mr-1 inline size-4" />
            Llegaste al límite de {maxUsers} miembros de tu plan.
          </span>
          <Button asChild size="sm">
            <a href="/settings/billing">Upgrade plan</a>
          </Button>
        </div>
      )}

      {/* Lista de members */}
      <section className="sf-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Miembros ({members.length}
            {maxUsers ? ` / ${maxUsers}` : ""})
          </h3>
          <Button
            onClick={() => setShowInvite(!showInvite)}
            disabled={atLimit}
            size="sm"
            variant={showInvite ? "outline" : "default"}
          >
            {showInvite ? (
              "Cancelar"
            ) : (
              <>
                <UserPlus className="mr-1 size-3.5" />
                Invitar
              </>
            )}
          </Button>
        </div>

        {showInvite && (
          <form
            action={handleInvite}
            className="mb-4 space-y-3 rounded-xl border border-input bg-muted/30 p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="staff@tuestudio.com"
                  className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium">Rol</label>
                <select
                  name="role"
                  defaultValue="staff"
                  className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Mensaje personal (opcional)
              </label>
              <textarea
                name="message"
                rows={2}
                placeholder="¡Hola! Te invité para que me ayudes con la edición..."
                className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Mail className="mr-1 size-3.5" />
              )}
              Crear invitación
            </Button>
          </form>
        )}

        <ul className="divide-y divide-border">
          {members.map((m) => {
            const isYou = m.user_id === currentUserId
            return (
              <li
                key={m.user_id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      {m.name ?? m.email}
                      {isYou && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          (tú)
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {m.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {m.role === "owner" ? (
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                        ROLE_BADGE_CLS.owner
                      }
                    >
                      <Crown className="size-2.5" />
                      Owner
                    </span>
                  ) : isYou ? (
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                        (ROLE_BADGE_CLS[m.role] ?? ROLE_BADGE_CLS.staff)
                      }
                    >
                      {m.role}
                    </span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) =>
                        handleRoleChange(m.user_id, e.target.value as StudioRole)
                      }
                      disabled={isPending}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {!isYou && m.role !== "owner" && (
                    <Button
                      onClick={() => handleRemove(m.user_id, m.name ?? m.email ?? "")}
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Invitaciones pendientes */}
      {invitations.length > 0 && (
        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Mail className="mr-1 inline size-3.5" />
            Invitaciones pendientes ({invitations.length})
          </h3>
          <ul className="divide-y divide-border">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Rol:{" "}
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[9px] font-medium " +
                        (ROLE_BADGE_CLS[inv.role] ?? ROLE_BADGE_CLS.staff)
                      }
                    >
                      {inv.role}
                    </span>
                    {" · "}
                    Expira{" "}
                    {new Date(inv.expires_at).toLocaleDateString("es-DO")}
                    {inv.resent_count > 0 &&
                      ` · Reenviada ${inv.resent_count}x`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    onClick={() => handleResend(inv.id)}
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    title="Reenviar (extiende expiración 7 días)"
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                  <Button
                    onClick={() => handleRevoke(inv.id)}
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <XCircle className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
