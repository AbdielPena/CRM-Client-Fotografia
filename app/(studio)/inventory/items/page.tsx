import Link from "next/link"
import { Package, Plus, AlertTriangle, Box } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getInvItems } from "@/server/services/inv-item.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/shared/search-input"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableColumn,
  DataTableFooter,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table"

export const metadata: Metadata = { title: "Inventario · Items" }

const PAGE_SIZE = 50

type SearchParamsShape = {
  q?: string
  page?: string
  kind?: string
  lowStock?: string
}

/** Locale-aware number format (formatNumber lo agrega F1; aquí inline para ser branch-independent). */
function fmtNum(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value)
}

export default async function InventoryItemsPage({
  searchParams,
}: {
  searchParams?: SearchParamsShape
}) {
  const session = await requireStudioAuth()

  const search = searchParams?.q?.trim() ?? ""
  const page = Math.max(1, Number(searchParams?.page) || 1)
  const kind =
    searchParams?.kind === "serialized" || searchParams?.kind === "bulk"
      ? searchParams.kind
      : undefined
  const lowStock = searchParams?.lowStock === "1"

  const items = await getInvItems(session.studioId, {
    search: search || undefined,
    kind,
    lowStockOnly: lowStock,
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <>
      <AppTopbar
        title="Inventario"
        description="Equipos del estudio — cámaras, lentes, props, accesorios"
        actions={
          <Button asChild>
            <Link href="/inventory/items/new">
              <Plus className="mr-1 size-4" />
              Nuevo item
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Search + filtros */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Buscar por nombre, marca, modelo o código..." />
          <FilterChip
            href={
              kind
                ? buildHref({ ...searchParams, kind: undefined })
                : buildHref({ ...searchParams, kind: "serialized" })
            }
            active={kind === "serialized"}
            label="Serializados"
          />
          <FilterChip
            href={
              kind === "bulk"
                ? buildHref({ ...searchParams, kind: undefined })
                : buildHref({ ...searchParams, kind: "bulk" })
            }
            active={kind === "bulk"}
            label="A granel"
          />
          <FilterChip
            href={
              lowStock
                ? buildHref({ ...searchParams, lowStock: undefined })
                : buildHref({ ...searchParams, lowStock: "1" })
            }
            active={lowStock}
            label="Stock bajo"
            icon={<AlertTriangle className="size-3" />}
          />
        </div>

        {/* Lista */}
        {items.total === 0 ? (
          <EmptyState
            icon={<Package className="size-12 text-muted-foreground/60" />}
            title="Aún no hay items en tu inventario"
            description="Empieza creando tu primer equipo — una cámara, lente o accesorio."
          >
            <Button asChild>
              <Link href="/inventory/items/new">
                <Plus className="mr-1 size-4" />
                Crear primer item
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Nombre</DataTableColumn>
                <DataTableColumn>Tipo</DataTableColumn>
                <DataTableColumn>Marca · Modelo</DataTableColumn>
                <DataTableColumn className="text-right">Total</DataTableColumn>
                <DataTableColumn className="text-right">Disponible</DataTableColumn>
                <DataTableColumn className="text-right">Stock min.</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {items.items.map((it) => {
                const available =
                  it.quantity_total -
                  it.quantity_reserved -
                  it.quantity_loaned -
                  it.quantity_rented -
                  it.quantity_maintenance -
                  it.quantity_damaged -
                  it.quantity_lost
                const isLow = it.quantity_total <= it.min_stock
                return (
                  <DataTableRow key={it.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <Link
                        href={`/inventory/items/${it.id}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <Box className="size-4 text-muted-foreground" />
                        <span>{it.name}</span>
                        {it.internal_code && (
                          <code className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                            {it.internal_code}
                          </code>
                        )}
                      </Link>
                    </DataTableCell>
                    <DataTableCell>
                      <span
                        className={
                          it.kind === "serialized"
                            ? "inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                            : "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        }
                      >
                        {it.kind === "serialized" ? "Serializado" : "A granel"}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="text-sm text-muted-foreground">
                      {[it.brand, it.model].filter(Boolean).join(" · ") || "—"}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums">
                      {fmtNum(it.quantity_total)}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums">
                      <span
                        className={
                          available <= 0
                            ? "text-red-600 dark:text-red-400"
                            : available <= it.min_stock
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-foreground"
                        }
                      >
                        {fmtNum(available)}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums text-muted-foreground">
                      {isLow && (
                        <AlertTriangle className="mr-1 inline size-3 text-amber-500" />
                      )}
                      {fmtNum(it.min_stock)}
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
            <DataTableFooter>
              <Pagination
                page={items.page}
                totalPages={items.totalPages}
                total={items.total}
                pageSize={items.pageSize}
                baseHref="/inventory/items"
                preserveQuery={{
                  q: search || undefined,
                  kind: kind || undefined,
                  lowStock: lowStock ? "1" : undefined,
                }}
                itemsLabel="items"
              />
            </DataTableFooter>
          </DataTable>
        )}
      </main>
    </>
  )
}

function FilterChip({
  href,
  active,
  label,
  icon,
}: {
  href: string
  active: boolean
  label: string
  icon?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-accent")
      }
    >
      {icon}
      {label}
    </Link>
  )
}

function buildHref(params: SearchParamsShape): string {
  const usp = new URLSearchParams()
  if (params.q) usp.set("q", params.q)
  if (params.page) usp.set("page", params.page)
  if (params.kind) usp.set("kind", params.kind)
  if (params.lowStock) usp.set("lowStock", params.lowStock)
  const qs = usp.toString()
  return `/inventory/items${qs ? `?${qs}` : ""}`
}
