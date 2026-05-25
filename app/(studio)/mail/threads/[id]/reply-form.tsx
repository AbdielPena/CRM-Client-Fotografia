"use client"

import { useFormState, useFormStatus } from "react-dom"
import { Send, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"

import {
  sendMailAction,
  type SendMailActionState,
} from "@/server/actions/mail-thread.actions"
import { Button } from "@/components/ui/button"

const initialState: SendMailActionState = {}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 className="mr-1 size-4 animate-spin" />
          Enviando...
        </>
      ) : (
        <>
          <Send className="mr-1 size-4" />
          Enviar
        </>
      )}
    </Button>
  )
}

export function ReplyForm({
  accountId,
  threadId,
  replyToMessageId,
  defaultTo,
  defaultSubject,
  clientId,
  projectId,
  invoiceId,
}: {
  accountId: string
  threadId: string
  replyToMessageId: string | null
  defaultTo: string
  defaultSubject: string
  clientId?: string | null
  projectId?: string | null
  invoiceId?: string | null
}) {
  const [state, action] = useFormState(sendMailAction, initialState)

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="accountId" value={accountId} />
      {replyToMessageId && (
        <input
          type="hidden"
          name="replyToMessageId"
          value={replyToMessageId}
        />
      )}
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      {invoiceId && <input type="hidden" name="invoiceId" value={invoiceId} />}

      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}
      {state.ok === true && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          {state.message}
        </div>
      )}

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Para
        </label>
        <input
          type="text"
          name="to"
          required
          defaultValue={state.values?.to ?? defaultTo}
          placeholder='"Nombre" <email@host.com>, otro@host.com'
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {state.fieldErrors?.to?.[0] && (
          <p className="mt-1 text-[10px] text-red-600">{state.fieldErrors.to[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            CC (opcional)
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
            BCC (opcional)
          </label>
          <input
            type="text"
            name="bcc"
            defaultValue={state.values?.bcc}
            placeholder="bcc@host.com"
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Asunto
        </label>
        <input
          type="text"
          name="subject"
          required
          defaultValue={state.values?.subject ?? defaultSubject}
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {state.fieldErrors?.subject?.[0] && (
          <p className="mt-1 text-[10px] text-red-600">
            {state.fieldErrors.subject[0]}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Mensaje
        </label>
        <textarea
          name="textBody"
          required
          rows={8}
          defaultValue={state.values?.textBody}
          placeholder="Escribe tu respuesta..."
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {state.fieldErrors?.textBody?.[0] && (
          <p className="mt-1 text-[10px] text-red-600">
            {state.fieldErrors.textBody[0]}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-[10px] text-muted-foreground">
          {replyToMessageId
            ? "Respuesta vinculada al thread (mantiene threading RFC 5322)"
            : "Mensaje nuevo en este thread"}
        </p>
        <SubmitButton disabled={!accountId} />
      </div>
    </form>
  )
}
