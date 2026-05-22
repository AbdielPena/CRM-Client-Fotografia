"use client"

import { useRef, useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Send, Loader2, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react"

import {
  sendMailAction,
  type SendMailActionState,
} from "@/server/actions/mail-thread.actions"
import { Button } from "@/components/ui/button"
import { DraftAutoSaveIndicator } from "./draft-autosave"

const initialState: SendMailActionState = {}

type Account = {
  id: string
  email: string
  display_name: string | null
  is_default: boolean
}

export function ComposeForm({
  accounts,
  defaultAccountId,
  prefillTo,
  prefillSubject,
  prefillClientId,
  prefillProjectId,
  prefillInvoiceId,
  initialDraftId,
  initialBody,
}: {
  accounts: Account[]
  defaultAccountId: string
  prefillTo?: string
  prefillSubject?: string
  prefillClientId?: string
  prefillProjectId?: string
  prefillInvoiceId?: string
  initialDraftId?: string
  initialBody?: string
}) {
  const [state, action] = useFormState(sendMailAction, initialState)
  const router = useRouter()
  const [showCcBcc, setShowCcBcc] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Si succeed, redirect al thread del mensaje enviado
  if (state.ok && state.threadId && typeof window !== "undefined") {
    setTimeout(() => router.push(`/mail/threads/${state.threadId}`), 800)
  }

  return (
    <form ref={formRef} action={action} className="sf-card space-y-4 p-5">
      {state.ok === false && state.message && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{state.message}</p>
            {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-[11px]">
                {Object.entries(state.fieldErrors).map(([field, errs]) => (
                  <li key={field}>
                    <code>{field}</code>: {errs?.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {state.ok === true && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          {state.message}
          <span className="ml-auto text-[10px] opacity-70">
            Redirigiendo al thread...
          </span>
        </div>
      )}

      {/* From selector */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          De
        </label>
        <select
          name="accountId"
          required
          defaultValue={state.values?.accountId ?? defaultAccountId}
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.display_name ? `${a.display_name} <${a.email}>` : a.email}
              {a.is_default && " (default)"}
            </option>
          ))}
        </select>
      </div>

      {/* To */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Para
        </label>
        <input
          type="text"
          name="to"
          required
          defaultValue={state.values?.to ?? prefillTo ?? ""}
          placeholder='"Nombre" <email@host.com>, otro@host.com'
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {state.fieldErrors?.to?.[0] && (
          <p className="mt-1 text-[10px] text-red-600">{state.fieldErrors.to[0]}</p>
        )}
      </div>

      {/* CC/BCC toggle */}
      {!showCcBcc ? (
        <button
          type="button"
          onClick={() => setShowCcBcc(true)}
          className="text-[11px] text-primary hover:underline"
        >
          + Añadir CC / BCC
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              CC
            </label>
            <input
              type="text"
              name="cc"
              defaultValue={state.values?.cc}
              placeholder="cc@host.com"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              BCC
            </label>
            <input
              type="text"
              name="bcc"
              defaultValue={state.values?.bcc}
              placeholder="bcc@host.com (oculto)"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {/* Subject */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Asunto
        </label>
        <input
          type="text"
          name="subject"
          required
          defaultValue={state.values?.subject ?? prefillSubject ?? ""}
          placeholder="Asunto del mensaje"
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {state.fieldErrors?.subject?.[0] && (
          <p className="mt-1 text-[10px] text-red-600">
            {state.fieldErrors.subject[0]}
          </p>
        )}
      </div>

      {/* Body */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Mensaje
        </label>
        <textarea
          name="textBody"
          required
          rows={12}
          defaultValue={state.values?.textBody ?? initialBody}
          placeholder="Escribe el cuerpo del mensaje..."
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {state.fieldErrors?.textBody?.[0] && (
          <p className="mt-1 text-[10px] text-red-600">
            {state.fieldErrors.textBody[0]}
          </p>
        )}
      </div>

      {/* Cross-módulo prefills hidden */}
      {prefillClientId && (
        <input type="hidden" name="clientId" value={prefillClientId} />
      )}
      {prefillProjectId && (
        <input type="hidden" name="projectId" value={prefillProjectId} />
      )}
      {prefillInvoiceId && (
        <input type="hidden" name="invoiceId" value={prefillInvoiceId} />
      )}

      {(prefillClientId || prefillProjectId || prefillInvoiceId) && (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
          Este mensaje se vinculará automáticamente al{" "}
          {prefillClientId && "cliente"}
          {prefillProjectId && " proyecto"}
          {prefillInvoiceId && " factura"} referenciado por la URL.
        </p>
      )}

      {/* Auto-save + Submit */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <DraftAutoSaveIndicator
          formRef={formRef}
          initialDraftId={initialDraftId}
        />
        <SubmitButton succeeded={state.ok === true} />
      </div>
    </form>
  )
}

function SubmitButton({ succeeded }: { succeeded: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || succeeded}>
      {pending ? (
        <>
          <Loader2 className="mr-1 size-4 animate-spin" />
          Enviando...
        </>
      ) : (
        <>
          <Send className="mr-1 size-4" />
          Enviar mensaje
        </>
      )}
    </Button>
  )
}
