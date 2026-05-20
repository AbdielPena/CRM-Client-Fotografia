import Link from "next/link"
import { Download, FileText, ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  generateReport607,
  generateReport606,
} from "@/server/services/fiscal-reports.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Reportes DGII · Fiscal" }

export default async function FiscalReportsPage({
  searchParams,
}: {
  searchParams?: { period?: string }
}) {
  const session = await requireStudioAuth()

  // Periodo default: mes actual
  const now = new Date()
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const period = searchParams?.period ?? defaultPeriod

  // Validar formato
  const validPeriod = /^\d{4}-\d{2}$/.test(period) ? period : defaultPeriod

  const [report607, report606, unread] = await Promise.all([
    generateReport607(session.studioId, validPeriod).catch(() => null),
    generateReport606(session.studioId, validPeriod).catch(() => null),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración / Fiscal"
        title="Reportes DGII"
        description="Formatos 606 (compras) y 607 (ventas) para presentación mensual a DGII RD."
        unreadNotifications={unread}
        actions={
          <Link
            href="/settings/fiscal"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6 lg:px-8 lg:py-8">
        {/* Selector de periodo */}
        <section className="sf-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Periodo
          </h2>
          <form action="/settings/fiscal/reports" method="GET" className="flex items-center gap-3">
            <input
              type="month"
              name="period"
              defaultValue={validPeriod}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" size="sm">
              Cargar reportes
            </Button>
          </form>
        </section>

        {/* Reporte 607 — Ventas */}
        <section className="sf-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl">
                <FileText className="size-5 text-primary" />
                Formato 607 — Ventas
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Facturas emitidas con NCF en {validPeriod}. Reporta tus ventas
                a DGII mensualmente antes del día 20.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Documentos</p>
              <p className="text-xl font-bold tabular-nums">
                {report607?.summary.rows ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Total facturado</p>
              <p className="text-xl font-bold tabular-nums">
                ${report607?.summary.totalAmount ?? "0.00"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Total ITBIS</p>
              <p className="text-xl font-bold tabular-nums">
                ${report607?.summary.totalItbis ?? "0.00"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button asChild>
              <a
                href={`/api/fiscal/reports/607?period=${validPeriod}`}
                download={`607_${validPeriod}.txt`}
              >
                <Download className="mr-1 size-4" />
                Descargar TSV
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/api/fiscal/reports/607?period=${validPeriod}&format=json`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver JSON
              </a>
            </Button>
          </div>
        </section>

        {/* Reporte 606 — Compras */}
        <section className="sf-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl">
                <FileText className="size-5 text-muted-foreground" />
                Formato 606 — Compras
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Gastos con NCF de proveedores en {validPeriod}. Permite deducir
                ITBIS pagado al adquirir bienes/servicios.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Documentos</p>
              <p className="text-xl font-bold tabular-nums">
                {report606?.summary.rows ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Total compras</p>
              <p className="text-xl font-bold tabular-nums">
                ${report606?.summary.totalAmount ?? "0.00"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">ITBIS pagado</p>
              <p className="text-xl font-bold tabular-nums">
                ${report606?.summary.totalItbis ?? "0.00"}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <strong>V2 pendiente:</strong> el reporte 606 requiere que cada
            CxP tenga el NCF del proveedor + RNC. Aplica migration{" "}
            <code>ALTER TABLE fin_payables ADD COLUMN ncf_proveedor TEXT, ADD COLUMN rnc_proveedor TEXT;</code>{" "}
            y agrega esos campos al form de creación.
          </div>
        </section>

        {/* Info DGII */}
        <section className="rounded-xl border border-border bg-muted/30 p-4 text-[11px] text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Sobre los reportes DGII</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Formato TSV pipe-delimited (|) según especificación oficial DGII RD.
            </li>
            <li>
              Descarga el archivo .txt y súbelo al portal DGII en la sección{" "}
              <strong>Servicios &gt; Envío de Datos</strong>.
            </li>
            <li>
              Plazos: <strong>día 20 de cada mes</strong> para reportar el mes
              anterior. Multa por presentación tardía: 1 SM (~$10,000 RD).
            </li>
            <li>
              Las facturas SIN NCF (anteriores a tener tax_config) no aparecen
              en el 607. Solo se incluyen rows con NCF asignado.
            </li>
          </ul>
        </section>
      </div>
    </>
  )
}
