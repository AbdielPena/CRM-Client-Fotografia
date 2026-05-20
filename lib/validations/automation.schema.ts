import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

export const triggerEvents = [
  "client.created",
  "project.created",
  "project.status_changed",
  "invoice.sent",
  "invoice.paid",
  "booking.received",
  "inv_loan.created",
  "inv_loan.returned",
  "inv_rental.completed",
  "gallery.published",
  "contract.signed",
] as const

export const actionKinds = [
  "send_email",
  "create_task",
  "send_notification",
  "update_project_status",
  "add_tag",
] as const

export const createAutomationSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(200),
  description: z.preprocess(
    emptyAsUndefined,
    z.string().max(2000).optional(),
  ),
  triggerEvent: z.enum(triggerEvents),
  triggerFiltersJson: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .max(2000)
      .refine(
        (v) => {
          if (!v) return true
          try {
            JSON.parse(v)
            return true
          } catch {
            return false
          }
        },
        { message: "triggerFiltersJson debe ser JSON válido" },
      )
      .optional(),
  ),
  actionKind: z.enum(actionKinds),
  actionConfigJson: z
    .string()
    .min(2, "actionConfig requerido")
    .max(4000)
    .refine(
      (v) => {
        try {
          JSON.parse(v)
          return true
        } catch {
          return false
        }
      },
      { message: "actionConfig debe ser JSON válido" },
    ),
  isActive: z.boolean().optional(),
})

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>
