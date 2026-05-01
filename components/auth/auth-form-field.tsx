"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, Eye, EyeOff, Check } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AuthFormFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string
  name: string
  error?: string | null
  success?: boolean
  hint?: string
  required?: boolean
  rightAccessory?: React.ReactNode
}

export function AuthFormField({
  label,
  name,
  type: typeProp = "text",
  error,
  success,
  hint,
  required,
  className,
  rightAccessory,
  ...props
}: AuthFormFieldProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const isPassword = typeProp === "password"
  const type = isPassword && showPassword ? "text" : typeProp

  const variant = error ? "error" : success ? "success" : "default"

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label
        htmlFor={name}
        required={required}
        tone={error ? "error" : "default"}
      >
        {label}
      </Label>

      <div className="relative">
        <Input
          id={name}
          name={name}
          type={type}
          variant={variant}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${name}-error` : hint ? `${name}-hint` : undefined
          }
          required={required}
          className={cn(
            "pr-10",
            (isPassword || rightAccessory) && "pr-10",
          )}
          {...props}
        />

        {/* Right-side icons (password toggle OR success check OR error) */}
        <div className="absolute inset-y-0 right-2.5 flex items-center gap-1">
          <AnimatePresence mode="wait" initial={false}>
            {error ? (
              <motion.span
                key="err"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
                className="pointer-events-none flex items-center justify-center"
                aria-hidden="true"
              >
                <AlertCircle className="h-4 w-4 text-danger" />
              </motion.span>
            ) : success ? (
              <motion.span
                key="ok"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
                className="pointer-events-none flex items-center justify-center"
                aria-hidden="true"
              >
                <Check className="h-4 w-4 text-success" />
              </motion.span>
            ) : null}
          </AnimatePresence>

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground",
                "hover:text-foreground hover:bg-muted",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
                "transition-colors duration-fast",
              )}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
          {rightAccessory}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="err"
            id={`${name}-error`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="text-caption text-danger flex items-center gap-1.5"
          >
            <AlertCircle className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {error}
          </motion.p>
        ) : hint ? (
          <p
            id={`${name}-hint`}
            className="text-caption text-muted-foreground"
          >
            {hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
