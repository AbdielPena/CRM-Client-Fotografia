"use client"

import { useState, useTransition } from "react"
import {
  ShieldCheck,
  ShieldOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  KeyRound,
  RefreshCw,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import {
  disable2FAAction,
  enable2FAAction,
  initiate2FAAction,
  regenerateRecoveryCodesAction,
  verify2FAInitAction,
} from "@/server/actions/user-2fa.actions"
import type { User2FAStatus } from "@/server/services/user-2fa.service"
import { Button } from "@/components/ui/button"

type Step = "idle" | "setup" | "verify" | "recovery_codes_shown"

export function TotpManager({
  status,
  userEmail,
  studioName,
}: {
  status: User2FAStatus | null
  userEmail: string
  studioName: string
}) {
  const [step, setStep] = useState<Step>("idle")
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  const [disableCode, setDisableCode] = useState("")
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)

  const isEnabled = status?.isEnabled ?? false
  const isVerified = status?.isVerified ?? false
  const recoveryRemaining = status?.recoveryCodesRemaining ?? 0

  async function handleInitiate() {
    startTransition(async () => {
      const res = await initiate2FAAction()
      if (res.ok && res.secret && res.otpauthUri) {
        setSecret(res.secret)
        setOtpauthUri(res.otpauthUri)
        setStep("setup")
        setFeedback(null)
      } else {
        setFeedback({ type: "err", msg: res.message ?? "Error" })
      }
    })
  }

  async function handleVerify() {
    startTransition(async () => {
      const res = await verify2FAInitAction(verifyCode)
      if (res.ok && res.recoveryCodes) {
        setRecoveryCodes(res.recoveryCodes)
        setStep("recovery_codes_shown")
        // Auto-enable después de verificar
        await enable2FAAction()
        setFeedback({
          type: "ok",
          msg: "2FA activado. Guarda tus recovery codes.",
        })
      } else {
        setFeedback({ type: "err", msg: res.message ?? "Código inválido" })
      }
    })
  }

  async function handleDisable() {
    if (!disableCode) return
    startTransition(async () => {
      const res = await disable2FAAction(disableCode)
      if (res.ok) {
        setFeedback({ type: "ok", msg: "2FA desactivado" })
        setStep("idle")
        setTimeout(() => window.location.reload(), 800)
      } else {
        setFeedback({ type: "err", msg: res.message ?? "Código inválido" })
      }
    })
  }

  async function handleRegenerateRecovery() {
    if (
      !window.confirm(
        "¿Generar nuevos recovery codes? Los anteriores se invalidarán inmediatamente.",
      )
    )
      return
    startTransition(async () => {
      const res = await regenerateRecoveryCodesAction()
      if (res.ok && res.codes) {
        setRecoveryCodes(res.codes)
        setStep("recovery_codes_shown")
      } else {
        setFeedback({ type: "err", msg: res.message ?? "Error" })
      }
    })
  }

  function copyCodes() {
    if (!recoveryCodes) return
    navigator.clipboard.writeText(recoveryCodes.join("\n"))
    setFeedback({ type: "ok", msg: "Códigos copiados al portapapeles" })
  }

  // QR via Google Chart (cliente, no requiere lib server)
  const qrUrl = otpauthUri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`
    : null

  return (
    <section className="sf-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="mr-1 inline size-3.5" />
            Autenticación de dos factores
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {userEmail}
          </p>
        </div>
        <StatusBadge enabled={isEnabled} verified={isVerified} />
      </div>

      {feedback && (
        <div
          className={
            "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm " +
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

      <AnimatePresence mode="wait">
        {/* IDLE: No tiene 2FA o no está enabled */}
        {step === "idle" && !isEnabled && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4"
          >
            <Button onClick={handleInitiate} disabled={isPending} size="sm">
              {isPending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1 size-3.5" />
              )}
              Activar 2FA
            </Button>
          </motion.div>
        )}

        {/* SETUP: Show QR + secret */}
        {step === "setup" && qrUrl && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 space-y-4 rounded-xl border border-input bg-muted/30 p-4"
          >
            <p className="text-sm">
              1. Escanea este QR con Google Authenticator, 1Password, Authy o
              similar:
            </p>
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="QR Code"
                width={200}
                height={200}
                className="rounded-lg border border-border bg-white p-2"
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  ¿No puedes escanear? Ingresa el secret manualmente
                </summary>
                <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[10px]">
                  {secret}
                </code>
                <p className="mt-1 text-[10px]">
                  Tipo: TOTP · Issuer: {studioName} · 6 dígitos · 30s
                </p>
              </details>
            </div>

            <div>
              <p className="mb-1.5 text-sm">
                2. Ingresa el código de 6 dígitos que aparece en tu app:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-center font-mono text-lg tracking-widest"
                />
                <Button
                  onClick={handleVerify}
                  disabled={isPending || verifyCode.length !== 6}
                >
                  {isPending ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 size-4" />
                  )}
                  Verificar
                </Button>
              </div>
            </div>

            <Button
              onClick={() => setStep("idle")}
              size="sm"
              variant="outline"
            >
              Cancelar
            </Button>
          </motion.div>
        )}

        {/* RECOVERY CODES SHOWN */}
        {step === "recovery_codes_shown" && recoveryCodes && (
          <motion.div
            key="recovery"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
          >
            <div className="flex items-start gap-2">
              <KeyRound className="mt-0.5 size-4 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
                  Guarda estos recovery codes
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Cada código solo funciona UNA VEZ. Te permiten acceder si
                  pierdes tu dispositivo.
                </p>
              </div>
            </div>

            <ul className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((c) => (
                <li
                  key={c}
                  className="rounded bg-amber-100 px-3 py-2 text-center font-mono text-xs font-semibold dark:bg-amber-900"
                >
                  {c}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-end gap-2">
              <Button onClick={copyCodes} size="sm" variant="outline">
                <Copy className="mr-1 size-3.5" />
                Copiar todos
              </Button>
              <Button
                onClick={() => window.location.reload()}
                size="sm"
              >
                Ya los guardé
              </Button>
            </div>
          </motion.div>
        )}

        {/* ENABLED: management options */}
        {step === "idle" && isEnabled && (
          <motion.div
            key="enabled"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-input p-3 text-xs">
                <p className="text-muted-foreground">
                  Recovery codes restantes
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums">
                  {recoveryRemaining} / 10
                </p>
                {recoveryRemaining < 3 && recoveryRemaining > 0 && (
                  <p className="mt-1 text-[10px] text-amber-600">
                    ⚠ Quedan pocos — regenera
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-input p-3 text-xs">
                <p className="text-muted-foreground">Último uso</p>
                <p className="mt-1 text-sm">
                  {status?.lastUsedAt
                    ? new Date(status.lastUsedAt).toLocaleString("es-DO")
                    : "Nunca"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleRegenerateRecovery}
                size="sm"
                variant="outline"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 size-3.5" />
                )}
                Regenerar recovery codes
              </Button>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300">
                <ShieldOff className="size-3.5" />
                Desactivar 2FA (zona peligrosa)
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="Código TOTP o recovery"
                  className="flex-1 rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
                />
                <Button
                  onClick={handleDisable}
                  disabled={isPending || !disableCode}
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:bg-red-100 dark:hover:bg-red-900"
                >
                  Desactivar
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function StatusBadge({ enabled, verified }: { enabled: boolean; verified: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <ShieldCheck className="size-3.5" />
        Activo
      </span>
    )
  }
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        Verificado · Sin habilitar
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
      <ShieldOff className="size-3.5" />
      Inactivo
    </span>
  )
}
