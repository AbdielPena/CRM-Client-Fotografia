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

export function PortalNav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === "/portal"
      ? pathname === "/portal"
      : pathname === href || pathname.startsWith(href + "/")

  return (
    <nav className="mx-auto flex max-w-6xl gap-0.5 overflow-x-auto px-3 pb-2 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((item) => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
              active
                ? "text-gold-700"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="portal-nav-active"
                className="absolute inset-0 rounded-full bg-brand-soft"
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
