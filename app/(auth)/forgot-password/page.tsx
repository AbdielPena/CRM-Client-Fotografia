"use client"

import Link from "next/link"
import { useFormState, useFormStatus } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react"

import { requestPasswordResetAction, type AuthActionState } from "../actions"
import { AuthFormField } from "@/components/auth/auth-form-field"
import { Button } from "@/components/ui/button"

const initialState: AuthActionState = { status: "idle" }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="lg"
      fullWidth
      loading={pending}
      rightIcon={!pending ? <ArrowRight className="h-4 w-4" /> : undefined}
    >
      {pending ? "Enviando…" : "Enviar instrucciones"}
    </Button>
  )
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(
    requestPasswordResetAction,
    initialState,
  )

  const emailError =
    state.status === "error" ? state.fieldErrors?.email?.[0] ?? null : null
  const globalError =
    state.status === "error" && !state.fieldErrors ? state.message : null
  const isSuccess = state.status === "success"

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className="flex flex-col gap-8"
    >
      <header className="space-y-2">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-caption font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Volver a ingresar
        </Link>
        <h1 className="font-display text-display-lg leading-[1.05] text-foreground">
          Recuperar <span className="text-gradient-aurora">acceso</span>
        </h1>
        <p className="text-body text-muted-foreground">
          Ingresa tu email y te enviaremos un enlace para restablecer tu
          contraseña.
        </p>
      </header>

      {isSuccess ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex flex-col items-center gap-4 rounded-lg border border-success/30 bg-success-soft p-8 text-center"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
            <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-h3 font-semibold text-foreground">
              Revisa tu email
            </h2>
            <p className="text-body-sm text-muted-foreground">
              {state.message ??
                "Si existe una cuenta con ese email, recibirás un enlace en los próximos minutos."}
            </p>
          </div>
          <Link
            href="/login"
            className="text-caption font-medium text-brand hover:text-brand/80 transition-colors"
          >
            Volver al login
          </Link>
        </motion.div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <AuthFormField
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@estudio.com"
            error={emailError}
          />

          <AnimatePresence mode="wait">
            {globalError && (
              <motion.div
                key="err"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.22 }}
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-3.5 py-2.5"
              >
                <AlertCircle
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger"
                  aria-hidden="true"
                />
                <p className="text-body-sm text-danger leading-snug">
                  {globalError}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-2">
            <SubmitButton />
          </div>
        </form>
      )}
    </motion.div>
  )
}
