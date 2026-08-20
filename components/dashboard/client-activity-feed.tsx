import Link from "next/link"
import {
  Ban,
  Camera,
  CheckCircle2,
  FileSignature,
  Images,
  Receipt,
  UserPlus,
  Activity,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { RecentActivityItem } from "@/server/services/activity.service"

/**
 * "Actividad reciente de tus clientes".
 *
 * La lista de antes mezclaba TODO el historial del estudio en una tira plana:
 * tareas internas, formularios generados solos, y en medio lo que de verdad
 * importa —que una clienta firmó, eligió sus fotos o aceptó una cotización—.
 *
 * Esta versión hace dos cosas: se queda con lo que hizo o le pasó a un CLIENTE
 * (lo de adentro del estudio vive en Tareas), y lo agrupa por día, para leerlo
 * como un diario y no como un log.
 */

const ETIQUETAS: Record<string, string> = {
  "project.created": "Sesión creada",
  "project.updated": "Sesión actualizada",
  "project.cancelled": "Sesión cancelada",
  "project.cancellation_undone": "Cancelación deshecha",
  "project.status_changed": "Cambió de estado",
  "project.finalized": "Sesión finalizada",
  "client.created": "Cliente nuevo",
  "client.updated": "Cliente actualizado",
  "invoice.created": "Factura creada",
  "invoice.sent": "Factura enviada",
  "contract.created": "Contrato creado",
  "contract.sent": "Contrato enviado",
  "contract.signed": "Firmó el contrato",
  "contract.voided": "Contrato anulado",
  "gallery.created": "Galería creada",
  "gallery.delivered": "Entrega enviada",
  "gallery.selection_submitted": "Envió su selección",
  "forms.auto_created": "Formularios generados",
  "booking_request.created": "Pidió una reserva",
  "booking_request.approved": "Reserva aprobada",
  "booking_request.converted": "Reserva convertida en sesión",
  "booking_request.rejected": "Solicitud rechazada",
  "booking_request.cancelled": "Solicitud cancelada",
  "booking_quote.created": "Cotización enviada",
  "booking_quote.accepted": "Aceptó la cotización",
  "booking_quote.resent": "Cotización reenviada",
  "booking_quote.cancelled": "Cotización anulada",
  "print_selection.submitted": "Eligió sus impresiones",
}

/**
 * Lo que NO es del cliente: se queda fuera para que el bloque sea de verdad
 * "actividad en los clientes" y no el log entero del estudio.
 */
const ENTIDADES_DE_CLIENTE = new Set([
  "client",
  "project",
  "gallery",
  "contract",
  "invoice",
  "booking_request",
])

export function esDeCliente(r: RecentActivityItem): boolean {
  if (r.action.startsWith("task")) return false
  if (!r.entityType) return false
  return ENTIDADES_DE_CLIENTE.has(r.entityType)
}

function legible(action: string): string {
  const limpio = action.replace(/[._]+/g, " ").trim()
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

function iconoDe(action: string) {
  if (action.startsWith("invoice")) return Receipt
  if (action.startsWith("contract")) return FileSignature
  if (action.startsWith("gallery") || action.startsWith("print")) return Images
  if (action.startsWith("client")) return UserPlus
  if (action.includes("cancel")) return Ban
  if (action.startsWith("booking")) return CheckCircle2
  if (action.startsWith("project")) return Camera
  return Activity
}

/** Iniciales del cliente, para el círculo de la izquierda. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  const a = partes[0]![0] ?? ""
  const b = partes.length > 1 ? (partes[partes.length - 1]![0] ?? "") : ""
  return (a + b).toUpperCase()
}

const RD_TZ = "America/Santo_Domingo"

/** El día en RD, `YYYY-MM-DD`, para agrupar sin correrse de fecha. */
function diaRD(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RD_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

function tituloDelDia(dia: string): string {
  const hoy = diaRD(new Date().toISOString())
  const ayer = diaRD(new Date(Date.now() - 86_400_000).toISOString())
  if (dia === hoy) return "Hoy"
  if (dia === ayer) return "Ayer"
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dia}T00:00:00Z`))
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: RD_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

export function ClientActivityFeed({ items }: { items: RecentActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-muted-foreground">
        Todavía no hay movimientos de clientes.
      </p>
    )
  }

  // Agrupado por día, respetando el orden que ya viene (más reciente primero).
  const dias: Array<{ dia: string; filas: RecentActivityItem[] }> = []
  for (const r of items) {
    const d = diaRD(r.createdAt)
    const ultimo = dias[dias.length - 1]
    if (ultimo && ultimo.dia === d) ultimo.filas.push(r)
    else dias.push({ dia: d, filas: [r] })
  }

  return (
    <div className="space-y-5">
      {dias.map(({ dia, filas }) => (
        <section key={dia}>
          <div className="mb-2 flex items-center gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {tituloDelDia(dia)}
            </h3>
            <span className="h-px flex-1 bg-border/60" />
            <span className="text-[11px] tabular-nums text-muted-foreground/70">
              {filas.length}
            </span>
          </div>

          <ul className="space-y-0.5">
            {filas.map((r) => {
              const Icono = iconoDe(r.action)
              const titulo = ETIQUETAS[r.action] ?? legible(r.action)
              const cliente = r.clientName
              const fila = (
                <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      "bg-muted text-[10px] font-semibold text-muted-foreground",
                    )}
                  >
                    {cliente ? iniciales(cliente) : <Icono className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-foreground">
                      {cliente ? (
                        <>
                          <span className="font-medium">{cliente}</span>
                          <span className="text-muted-foreground"> · {titulo}</span>
                        </>
                      ) : (
                        <span className="font-medium">{titulo}</span>
                      )}
                    </p>
                    {r.description && r.description !== titulo && (
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80">
                    {hora(r.createdAt)}
                  </span>
                </div>
              )
              return (
                <li key={r.id}>
                  {r.href ? (
                    <Link
                      href={r.href}
                      prefetch={false}
                      className="block transition-colors hover:bg-muted/50 rounded-lg"
                    >
                      {fila}
                    </Link>
                  ) : (
                    fila
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
