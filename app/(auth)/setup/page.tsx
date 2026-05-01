"use client"

import { useFormState, useFormStatus } from "react-dom"
import { motion } from "framer-motion"
import { AlertCircle, ArrowRight, Sparkles } from "lucide-react"

import { AuthFormField } from "@/components/auth/auth-form-field"
import { Button } from "@/components/ui/button"
import { bootstrapStudioAction, type SetupActionState } from "./actions"

const initialState: SetupActionState = { status: "idle" }

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
      {pending ? "Creando studio…" : "Crear studio y entrar"}
    </Button>
  )
}

export default function SetupPage() {
  const [state, formAction] = useFormState(bootstrapStudioAction, initialState)

  const studioError =
    state.status === "error"
      ? state.fieldErrors?.studioName?.[0] ?? null
      : null
  const ownerError =
    state.status === "error"
      ? state.fieldErrors?.ownerName?.[0] ?? null
      : null
  const globalError =
    state.status === "error" && !state.fieldErrors ? state.message : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className="flex flex-col gap-8"
    >
      {/* Header */}
      <div className="space-y-2 text-center lg:text-left">
        <span className="inline-flex items-center gap-1.5 text-caption font-medium uppercase tracking-[0.14em] text-brand">
          <Sparkles className="h-3 w-3" />
          Último paso
        </span>
        <h1 className="font-display text-display-md leading-[1.1] text-foreground">
          Configura tu studio
        </h1>
        <p className="text-body text-muted-foreground">
          Solo necesitamos dos datos para encender tu cuenta — tardará unos
          segundos.
        </p>
      </div>

      {/* Form */}
      <form action={formAction} className="flex flex-col gap-5">
        <AuthFormField
          label="Nombre del estudio"
          name="studioName"
          type="text"
          required
          minLength={2}
          placeholder="Mi Estudio Fotográfico"
          error={studioError}
          autoComplete="organization"
        />

        <AuthFormField
          label="Tu nombre"
          name="ownerName"
          type="text"
          required
          minLength={2}
          placeholder="Abdiel Peña"
          error={ownerError}
          autoComplete="name"
        />

        {globalError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-body-sm text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{globalError}</span>
          </motion.div>
        )}

        <SubmitButton />
      </form>

      <p className="text-center text-caption text-muted-foreground">
        Este paso solo se muestra una vez.
      </p>
    </motion.div>
  )
}
