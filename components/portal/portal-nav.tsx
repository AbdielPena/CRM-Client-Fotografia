"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils/cn"

const NAV: { href: string; label: string }[] = [
  { href: "/portal", label: "Inicio" },
  { href: "/portal/galleries", label: "Galerías" },
  { href: "/portal/deliveries", label: "Entregas" },
  { href: "/portal/contracts", label: "Contratos" },
  { href: "/portal/invoices", label: "Facturas" },
  { href: "/portal/payments", label: "Pagos" },
  { href: "/portal/bookings", label: "Reservas" },
]

export function PortalNav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === "/portal"
      ? pathname === "/portal"
      : pathname === href || pathname.startsWith(href + "/")

  return (
    <nav className="mx-auto flex max-w-6xl gap-7 overflow-x-auto px-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((item) => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex-shrink-0 py-3.5 text-[13px] tracking-[0.02em] transition-colors",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active && (
              <motion.span
                layoutId="portal-nav-underline"
                className="absolute inset-x-0 -bottom-px h-px bg-gold-600"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
