"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import {
  LayoutDashboard,
  ImageIcon,
  Receipt,
  CreditCard,
  CalendarCheck,
  FileText,
  Package as PackageIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/portal", label: "Inicio", icon: LayoutDashboard },
  { href: "/portal/galleries", label: "Galerías", icon: ImageIcon },
  { href: "/portal/deliveries", label: "Entregas", icon: PackageIcon },
  { href: "/portal/contracts", label: "Contratos", icon: FileText },
  { href: "/portal/invoices", label: "Facturas", icon: Receipt },
  { href: "/portal/payments", label: "Pagos", icon: CreditCard },
  { href: "/portal/bookings", label: "Reservas", icon: CalendarCheck },
]

export function PortalNav({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal"
}) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === "/portal"
      ? pathname === "/portal"
      : pathname === href || pathname.startsWith(href + "/")

  if (orientation === "horizontal") {
    return (
      <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="portal-nav-pill-h"
                  className="absolute inset-0 rounded-full bg-muted"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <item.icon className="relative h-3.5 w-3.5" />
              <span className="relative">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="flex flex-col gap-0.5">
      <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Tu portal
      </p>
      {NAV.map((item) => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="portal-nav-pill"
                className="absolute inset-0 rounded-lg bg-muted"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <item.icon className="relative h-4 w-4" />
            <span className="relative">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
