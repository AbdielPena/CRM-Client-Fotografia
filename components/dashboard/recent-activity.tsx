"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  UserCheck,
  Users,
  CalendarDays,
  Receipt,
  FileText,
  Package,
  Inbox,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"

export type ActivityTone = "blue" | "emerald" | "violet" | "amber" | "rose"

const TONE_STYLES: Record<ActivityTone, string> = {
  blue: "bg-brand-soft text-brand",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
}

/**
 * Icon keys serializables — el server component pasa el string,
 * el client mapea al componente Lucide. Esto evita el error
 * "Functions cannot be passed directly to Client Components".
 */
export type ActivityIcon =
  | "lead"
  | "client"
  | "session"
  | "invoice"
  | "contract"
  | "package"
  | "booking"
  | "gallery"
  | "success"
  | "alert"

const ICON_MAP: Record<ActivityIcon, LucideIcon> = {
  lead: UserCheck,
  client: Users,
  session: CalendarDays,
  invoice: Receipt,
  contract: FileText,
  package: Package,
  booking: Inbox,
  gallery: ImageIcon,
  success: CheckCircle2,
  alert: AlertCircle,
}

export interface ActivityItem {
  id: string
  /** Key serializable — se mapea a un ícono Lucide en el cliente. */
  icon: ActivityIcon
  tone: ActivityTone
  title: string
  description?: string
  timestamp: string
  href?: string
}

interface RecentActivityProps {
  items: ActivityItem[]
  emptyLabel?: string
  className?: string
}

export function RecentActivity({
  items,
  emptyLabel = "Sin actividad reciente.",
  className,
}: RecentActivityProps) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <ul className={cn("space-y-1", className)}>
      {items.map((item, i) => {
        const Icon = ICON_MAP[item.icon]
        const Wrapper = item.href ? Link : "div"
        const wrapperProps = item.href ? { href: item.href } : {}

        return (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.32,
              delay: 0.04 * i,
              ease: [0.32, 0.72, 0, 1],
            }}
          >
            <Wrapper
              {...(wrapperProps as { href: string })}
              className={cn(
                "group flex items-start gap-3 rounded-lg px-2 py-2.5 -mx-2",
                "transition-colors duration-fast",
                item.href && "hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                  TONE_STYLES[item.tone],
                )}
              >
                <Icon className="h-4 w-4" />
              </span>

              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground leading-snug">
                      {item.description}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 whitespace-nowrap text-[11.5px] text-muted-foreground">
                  {item.timestamp}
                </span>
              </div>
            </Wrapper>
          </motion.li>
        )
      })}
    </ul>
  )
}
