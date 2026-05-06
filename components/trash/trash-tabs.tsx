"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Users,
  FolderOpen,
  FileText,
  Receipt,
  ImageIcon,
  PackageCheck,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"

export type TrashTab =
  | "clients"
  | "projects"
  | "contracts"
  | "invoices"
  | "galleries"
  | "deliveries"

interface TrashTabsProps {
  active: TrashTab
  counts: {
    clients: number
    projects: number
    contracts: number
    invoices: number
    galleries: number
    deliveries: number
  }
}

const TABS: ReadonlyArray<{
  key: TrashTab
  label: string
  icon: typeof Users
}> = [
  { key: "clients", label: "Clientes", icon: Users },
  { key: "projects", label: "Proyectos", icon: FolderOpen },
  { key: "contracts", label: "Contratos", icon: FileText },
  { key: "invoices", label: "Facturas", icon: Receipt },
  { key: "galleries", label: "Galerías", icon: ImageIcon },
  { key: "deliveries", label: "Entregas", icon: PackageCheck },
]

export function TrashTabs({ active, counts }: TrashTabsProps) {
  const searchParams = useSearchParams()

  function buildHref(tab: TrashTab): string {
    const params = new URLSearchParams()
    if (tab !== "clients") params.set("tab", tab)
    // Resetear paginación y búsqueda al cambiar de tab
    const qs = params.toString()
    return qs ? `/trash?${qs}` : "/trash"
  }

  return (
    <div className="border-b border-border">
      <nav
        className="-mb-px flex gap-1 overflow-x-auto"
        aria-label="Tipos de items"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active
          const count = counts[tab.key]
          const Icon = tab.icon
          return (
            <Link
              key={tab.key}
              href={buildHref(tab.key)}
              className={cn(
                "flex flex-shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-body-sm transition-colors",
                isActive
                  ? "border-brand font-semibold text-brand"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.5 text-caption tabular-nums",
                    isActive
                      ? "bg-brand/10 text-brand"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
