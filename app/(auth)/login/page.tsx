"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useFormState, useFormStatus } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react"

import { signInAction, type AuthActionState } from "../actions"
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
      {pending ? "Ingresando…" : "Ingresar a PixelOS"}
    </Button>
  )
}

export default function LoginPage() {
  // useSearchParams() requiere Suspense en Next 14 para SSG/CSR bailout
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const params = useSearchParams()
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard"

  const [state, formAction] = useFormState(signInAction, initialState)

  const emailError =
    state.status === "error" ? state.fieldErrors?.email?.[0] ?? null : null
  const passwordError =
    state.status === "error" ? state.fieldErrors?.password?.[0] ?? null : null
  const globalError =
    state.status === "error" && !state.fieldErrors ? state.message : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className="flex flex-col gap-6"
    >
      {/* Header */}
      <header className="space-y-1.5">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Iniciar sesión
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Bienvenido de vuelta a Abby Pixel.
        </p>
      </header>

      {/* Form */}
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <AuthFormField
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@estudio.com"
          error={emailError}
        />

        <AuthFormField
          label="Contraseña"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Mínimo 6 caracteres"
          error={passwordError}
          rightAccessory={undefined}
        />

        <div className="flex items-center justify-end -mt-1">
          <Link
            href="/forgot-password"
            className="text-caption font-medium text-muted-foreground hover:text-brand transition-colors duration-fast"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {/* Global error banner */}
        <AnimatePresence mode="wait">
          {globalError && (
            <motion.div
              key="global-err"
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

        {/* Success banner */}
        <AnimatePresence>
          {state.status === "success" && state.message && (
            <motion.div
              key="ok"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              role="status"
              className="flex items-start gap-2.5 rounded-md border border-success/30 bg-success-soft px-3.5 py-2.5"
            >
              <CheckCircle2
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-success"
                aria-hidden="true"
              />
              <p className="text-body-sm text-success leading-snug">
                {state.message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-2">
          <SubmitButton />
        </div>
      </form>

      {/* Footer: register link */}
      <p className="text-center text-body-sm text-muted-foreground">
        ¿Aún no tienes cuenta?{" "}
        <a
          href="https://hub.abbypixel.com/login?mode=signup"
          className="font-semibold text-brand hover:text-brand/80 transition-colors underline-offset-4 hover:underline"
        >
          Crea tu estudio gratis
        </a>
      </p>
    </motion.div>
  )
}

