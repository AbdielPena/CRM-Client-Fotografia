"use client"

import { useEffect, useState, useTransition } from "react"
import {
  Shield,
  ShieldCheck,
  Smartphone,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Copy,
} from "lucide-react"
import QRCode from "qrcode"

import {
  enrollMfaFactorAction,
  verifyMfaFactorAction,
  unenrollMfaFactorAction,
} from "@/server/actions/mfa.actions"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"

type Factor = {
  id: string
  friendlyName: string
  createdAt: string
}

interface MfaManagerProps {
  initialFactors: Factor[]
}

export function MfaManager({ initialFactors }: MfaManagerProps) {
  const [factors, setFactors] = useState<Factor[]>(initialFactors)
  const [enrolling, setEnrolling] = useState<{
    factorId: string
    secret: string
    uri: string
    qrDataUrl: string
  } | null>(null)
  const [code, setCode] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleEnroll() {
    setError(null)
    setSuccess(null)
    try {
      const result = await enrollMfaFactorAction("Mi authenticator")
      // Generar QR como DataURL desde el URI otpauth
      const qrDataUrl = await QRCode.toDataURL(result.uri, {
        margin: 1,
        width: 240,
        color: { dark: "#0f172a", light: "#ffffff" },
      })
      setEnrolling({
        factorId: result.factorId,
        secret: result.secret,
        uri: result.uri,
        qrDataUrl,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error iniciando 2FA")
    }
  }

  async function handleVerify() {
    if (!enrolling) return
    setError(null)
    startTransition(async () => {
      try {
        await verifyMfaFactorAction(enrolling.factorId, code)
        setSuccess("¡2FA activado correctamente! Tu cuenta ahora está protegida.")
        setEnrolling(null)
        setCode("")
        // Refresh factors list
        setFactors((prev) => [
          ...prev,
          {
            id: enrolling.factorId,
            friendlyName: "Authenticator App",
            createdAt: new Date().toISOString(),
          },
        ])
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Código incorrecto"
        if (msg === "CODE_INVALID_FORMAT") {
          setError("El código debe ser de 6 dígitos.")
        } else if (msg === "CODE_INCORRECT") {
          setError("Código incorrecto. Probá de nuevo.")
        } else {
          setError(msg)
        }
      }
    })
  }

  async function handleCancel() {
    setEnrolling(null)
    setCode("")
    setError(null)
  }

  async function handleUnenroll(factorId: string) {
    if (
      !confirm(
        "¿Estás seguro de desactivar 2FA? Tu cuenta quedará protegida solo por la contraseña.",
      )
    ) {
      return
    }
    setError(null)
    try {
      await unenrollMfaFactorAction(factorId)
      setFactors((prev) => prev.filter((f) => f.id !== factorId))
      setSuccess("2FA desactivado.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desactivando 2FA")
    }
  }

  function copySecret() {
    if (enrolling) navigator.clipboard.writeText(enrolling.secret)
  }

  const hasActive = factors.length > 0

  return (
    <div className="space-y-5">
      {/* Header con estado */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
        <div
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full",
            hasActive
              ? "bg-success-soft text-success"
              : "bg-warning-soft text-warning",
          )}
        >
          {hasActive ? (
            <ShieldCheck className="h-5 w-5" />
          ) : (
            <Shield className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">
            Autenticación de dos factores (2FA)
          </h3>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {hasActive
              ? "Tu cuenta está protegida con 2FA. Necesitás tu app authenticator + contraseña para entrar."
              : "Agregá una capa extra de seguridad. Necesitás Google Authenticator, Authy, 1Password o cualquier app TOTP."}
          </p>
        </div>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
          <p className="text-body-sm text-danger">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2.5 rounded-md border border-success/30 bg-success-soft px-3.5 py-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
          <p className="text-body-sm text-success">{success}</p>
        </div>
      )}

      {/* Lista de factores activos */}
      {hasActive && (
        <div className="space-y-2">
          <h4 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            Factores activos
          </h4>
          {factors.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{f.friendlyName}</p>
                <p className="text-caption text-muted-foreground">
                  Activado: {new Date(f.createdAt).toLocaleDateString("es")}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleUnenroll(f.id)}
                className="text-danger hover:bg-danger-soft hover:text-danger"
                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Flow de enrollment */}
      {!enrolling && !hasActive && (
        <Button
          onClick={handleEnroll}
          leftIcon={<Shield className="h-4 w-4" />}
        >
          Activar 2FA
        </Button>
      )}

      {enrolling && (
        <div className="space-y-4 rounded-lg border-2 border-brand/30 bg-card p-5">
          <div>
            <h4 className="font-semibold text-foreground">
              Paso 1 — Escaneá el QR
            </h4>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Abrí tu app authenticator (Google Authenticator, Authy, 1Password)
              y escaneá este código:
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-md bg-muted/30 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrolling.qrDataUrl}
              alt="QR code para 2FA"
              className="h-60 w-60 rounded bg-white p-2"
            />
            <details className="w-full text-center">
              <summary className="cursor-pointer text-caption text-muted-foreground hover:text-foreground">
                ¿No podés escanear? Mostrar código manual
              </summary>
              <div className="mt-2 flex items-center justify-center gap-2">
                <code className="rounded bg-background px-3 py-1.5 font-mono text-caption text-foreground">
                  {enrolling.secret}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copySecret}
                  leftIcon={<Copy className="h-3 w-3" />}
                >
                  Copiar
                </Button>
              </div>
            </details>
          </div>

          <div>
            <h4 className="font-semibold text-foreground">
              Paso 2 — Ingresá el código de 6 dígitos
            </h4>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Tu app generará un código nuevo cada 30 segundos. Pegalo abajo:
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              autoFocus
              disabled={isPending}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <Button
              onClick={handleVerify}
              disabled={code.length !== 6 || isPending}
              loading={isPending}
            >
              Verificar
            </Button>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
