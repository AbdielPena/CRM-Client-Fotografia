"use client"

import { useActionState, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Save,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react"

import {
  createMailAccountAction,
  testMailAccountAction,
  type MailAccountActionState,
} from "@/server/actions/mail-account.actions"
import { Button } from "@/components/ui/button"

const initialState: MailAccountActionState = {}

export function NewMailAccountForm({
  hasExistingDefault,
}: {
  hasExistingDefault: boolean
}) {
  const [createState, createAction, createPending] = useActionState(
    createMailAccountAction,
    initialState,
  )
  const [testState, testAction, testPending] = useActionState(
    testMailAccountAction,
    initialState,
  )
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Mostrar feedback del último action (test o create)
  const lastState =
    testState.ok !== undefined ? testState : createState
  const showState = createState.ok !== undefined ? createState : testState

  return (
    <form className="space-y-4">
      {/* Banner success/error */}
      {showState.ok === true && showState.message && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{showState.message}</p>
            {showState.testResult?.ok && showState.testResult.folders && (
              <p className="mt-1 text-[11px] opacity-80">
                Carpetas detectadas: {showState.testResult.folders.slice(0, 5).join(", ")}
                {showState.testResult.folders.length > 5 && "..."}
              </p>
            )}
          </div>
        </div>
      )}
      {showState.ok === false && showState.message && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{showState.message}</p>
            {showState.testResult && (
              <p className="mt-1 text-[11px] opacity-80">
                IMAP: {showState.testResult.imap ? "✓" : "✗"} · SMTP:{" "}
                {showState.testResult.smtp ? "✓" : "✗"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Datos básicos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Email"
          name="email"
          type="email"
          required
          placeholder="info@miestudio.com"
          defaultValue={lastState.values?.email}
          errors={lastState.fieldErrors?.email}
        />
        <Field
          label="Nombre para mostrar (opcional)"
          name="displayName"
          placeholder="Studio Fotográfico"
          defaultValue={lastState.values?.displayName}
        />
      </div>

      {/* IMAP */}
      <fieldset className="space-y-3 rounded-xl border border-border p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          IMAP (recepción)
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field
              label="Host IMAP"
              name="imapHost"
              required
              placeholder="mail.miestudio.com"
              defaultValue={lastState.values?.imapHost}
              errors={lastState.fieldErrors?.imapHost}
            />
          </div>
          <Field
            label="Puerto"
            name="imapPort"
            type="number"
            required
            defaultValue={lastState.values?.imapPort ?? "993"}
            errors={lastState.fieldErrors?.imapPort}
            hint="993 = IMAPS (recomendado)"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Usuario IMAP (default: tu email)"
            name="imapUsername"
            placeholder="info@miestudio.com"
            defaultValue={lastState.values?.imapUsername}
            errors={lastState.fieldErrors?.imapUsername}
          />
          <Field
            label="Password IMAP"
            name="imapPassword"
            type="password"
            required
            placeholder="••••••••"
            errors={lastState.fieldErrors?.imapPassword}
          />
        </div>
        <input type="hidden" name="imapSecure" value="true" />
      </fieldset>

      {/* SMTP — opcional con toggle "usar mismas creds" */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-xs text-primary hover:underline"
      >
        {showAdvanced ? "Ocultar" : "Mostrar"} configuración SMTP avanzada
      </button>

      {!showAdvanced && (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Por defecto SMTP usa el mismo host/usuario/password de IMAP (puerto
          587 con STARTTLS). Esto cubre el 90% de configs Mailcow.
          <br />
          Si tu Mailcow tiene SMTP en host distinto, expande la sección.
        </p>
      )}

      {showAdvanced && (
        <fieldset className="space-y-3 rounded-xl border border-border p-4">
          <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            SMTP (envío)
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field
                label="Host SMTP"
                name="smtpHost"
                placeholder="(usar host IMAP)"
                defaultValue={lastState.values?.smtpHost}
              />
            </div>
            <Field
              label="Puerto"
              name="smtpPort"
              type="number"
              defaultValue={lastState.values?.smtpPort ?? "587"}
              hint="587 STARTTLS / 465 SMTPS"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Usuario SMTP (default: igual a IMAP)"
              name="smtpUsername"
              defaultValue={lastState.values?.smtpUsername}
            />
            <Field
              label="Password SMTP (default: igual a IMAP)"
              name="smtpPassword"
              type="password"
              placeholder="•••••••• (opcional)"
            />
          </div>
          <input type="hidden" name="smtpSecure" value="true" />
        </fieldset>
      )}

      {/* Default checkbox */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          value="true"
          defaultChecked={!hasExistingDefault}
          className="size-4 rounded border-input"
        />
        <span>
          Usar esta cuenta como default para envíos del studio
          {hasExistingDefault && (
            <span className="ml-1 text-xs text-muted-foreground">
              (reemplazará la cuenta default actual)
            </span>
          )}
        </span>
      </label>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          type="submit"
          formAction={testAction}
          disabled={testPending || createPending}
          variant="outline"
        >
          {testPending ? (
            <>
              <Loader2 className="mr-1 size-4 animate-spin" />
              Probando...
            </>
          ) : (
            <>
              <Wifi className="mr-1 size-4" />
              Probar conexión
            </>
          )}
        </Button>
        <Button
          type="submit"
          formAction={createAction}
          disabled={testPending || createPending}
        >
          {createPending ? (
            <>
              <Loader2 className="mr-1 size-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-1 size-4" />
              Guardar cuenta
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  name,
  required,
  defaultValue,
  placeholder,
  hint,
  type = "text",
  errors,
}: {
  label: string
  name: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  hint?: string
  type?: string
  errors?: string[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {hint && !errors?.[0] && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
      {errors?.[0] && <p className="mt-1 text-[10px] text-red-600">{errors[0]}</p>}
    </div>
  )
}
