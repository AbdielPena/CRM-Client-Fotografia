import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  getARAging,
  getCashFlow,
  getPLReport,
  getTopClients,
} from "@/server/services/reports.service"
import { getForecast } from "@/server/services/reports-forecast.service"

/**
 * Endpoint que exporta reportes a CSV.
 *
 * GET /api/reports/export?type=pl&year=2025
 * GET /api/reports/export?type=cashflow&months=12
 * GET /api/reports/export?type=ar_aging
 * GET /api/reports/export?type=top_clients&year=2025
 * GET /api/reports/export?type=forecast&months=6
 *
 * Output: text/csv con BOM UTF-8 (compatibilidad Excel).
 */
export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const url = new URL(req.url)
  const type = url.searchParams.get("type") ?? "pl"
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear()
  const months = Number(url.searchParams.get("months")) || 12

  let csv = ""
  let filename = ""

  try {
    switch (type) {
      case "pl": {
        const pl = await getPLReport(session.studioId, { year })
        csv =
          "Periodo,Ingresos,Gastos,Utilidad,Margen %\n" +
          `${pl.period},${pl.income.toFixed(2)},${pl.expenses.toFixed(2)},${pl.profit.toFixed(2)},${pl.profitMargin.toFixed(1)}\n` +
          "\nBreakdown por categoría:\n" +
          "Categoría,Monto,Porcentaje\n" +
          pl.breakdown.byCategory
            .map(
              (c) =>
                `${escapeCsv(c.category)},${c.amount.toFixed(2)},${c.percentage.toFixed(1)}`,
            )
            .join("\n")
        filename = `pl-${year}.csv`
        break
      }

      case "cashflow": {
        const cf = await getCashFlow(session.studioId, { months })
        csv =
          "Mes,Ingresos,Gastos,Neto,Acumulado\n" +
          cf
            .map(
              (e) =>
                `${e.date.slice(0, 7)},${e.income.toFixed(2)},${e.expenses.toFixed(2)},${e.net.toFixed(2)},${e.cumulative.toFixed(2)}`,
            )
            .join("\n")
        filename = `cashflow-${months}m.csv`
        break
      }

      case "ar_aging": {
        const aging = await getARAging(session.studioId)
        csv =
          "Bucket,Total,Cantidad\n" +
          aging
            .map(
              (b) =>
                `${escapeCsv(b.bucketLabel)},${b.total.toFixed(2)},${b.count}`,
            )
            .join("\n") +
          "\n\nDetalle de facturas:\n" +
          "Bucket,Factura,Cliente,Total,Días atrasada,Vencimiento\n" +
          aging
            .flatMap((b) =>
              b.invoices.map(
                (inv) =>
                  `${escapeCsv(b.bucketLabel)},${escapeCsv(inv.invoice_number)},${escapeCsv(inv.client_name)},${inv.total.toFixed(2)},${inv.days_overdue},${inv.due_date ?? ""}`,
              ),
            )
            .join("\n")
        filename = `ar-aging-${new Date().toISOString().slice(0, 10)}.csv`
        break
      }

      case "top_clients": {
        const clients = await getTopClients(session.studioId, {
          year,
          limit: 50,
        })
        csv =
          "Rank,Cliente,Revenue,Facturas,Promedio,Última factura\n" +
          clients
            .map(
              (c, i) =>
                `${i + 1},${escapeCsv(c.clientName)},${c.totalRevenue.toFixed(2)},${c.invoiceCount},${c.averageInvoice.toFixed(2)},${c.lastInvoiceDate ?? ""}`,
            )
            .join("\n")
        filename = `top-clients-${year}.csv`
        break
      }

      case "forecast": {
        const fc = await getForecast(session.studioId, { months })
        csv =
          "Mes,Ingresos esperados,Gastos esperados,Neto,Acumulado,Receivables,Pending Invoices,Upcoming Projects,Subscriptions,Payables\n" +
          fc
            .map(
              (e) =>
                `${e.month},${e.expectedIncome.toFixed(2)},${e.expectedExpenses.toFixed(2)},${e.netProjected.toFixed(2)},${e.cumulativeProjected.toFixed(2)},${e.breakdown.receivables.toFixed(2)},${e.breakdown.pendingInvoices.toFixed(2)},${e.breakdown.upcomingProjects.toFixed(2)},${e.breakdown.subscriptions.toFixed(2)},${e.breakdown.payables.toFixed(2)}`,
            )
            .join("\n")
        filename = `forecast-${months}m.csv`
        break
      }

      default:
        return NextResponse.json(
          { error: "INVALID_TYPE", message: `type debe ser pl|cashflow|ar_aging|top_clients|forecast` },
          { status: 400 },
        )
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: "EXPORT_FAILED",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 },
    )
  }

  // BOM UTF-8 para Excel compatibility
  const body = "﻿" + csv
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    },
  })
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
