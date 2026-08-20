"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils/cn"

/**
 * Tarjeta "lo próximo" del dashboard.
 *
 * El dashboard estaba regado: muchas listas largas, todas del mismo tamaño, y
 * había que leerlas enteras para saber qué toca. Estas tarjetas invierten eso:
 * **lo que sigue va grande**, y lo que viene después queda en letra chica
 * debajo. De un vistazo se sabe qué es lo próximo de cada cosa.
 *
 * Cada categoría lleva su propio acento pastel para distinguirlas sin leer.
 */

export type FocusTone = "azul" | "lila" | "menta"

const TONOS: Record<
  FocusTone,
  { punto: string; halo: string; borde: string; texto: string }
> = {
  azul: {
    punto: "bg-sky-500",
    halo: "bg-sky-50 dark:bg-sky-950/30",
    borde: "hover:border-sky-300/70 dark:hover:border-sky-800",
    texto: "text-sky-700 dark:text-sky-300",
  },
  lila: {
    punto: "bg-violet-500",
    halo: "bg-violet-50 dark:bg-violet-950/30",
    borde: "hover:border-violet-300/70 dark:hover:border-violet-800",
    texto: "text-violet-700 dark:text-violet-300",
  },
  menta: {
    punto: "bg-emerald-500",
    halo: "bg-emerald-50 dark:bg-emerald-950/30",
    borde: "hover:border-emerald-300/70 dark:hover:border-emerald-800",
    texto: "text-emerald-700 dark:text-emerald-300",
  },
}

export type FocusMain = {
  /** El nombre que importa: casi siempre el del cliente. */
  title: string
  /** La fecha en palabras — "jue 22 de agosto". */
  when: string | null
  /** Lo urgente en dos palabras: "en 3 días", "hoy", "hace 2 días". */
  badge?: string | null
  /** Se pinta en rojo: ya se pasó la fecha. */
  urgent?: boolean
  /** Una línea más de contexto: la sesión, el lugar, la hora. */
  detail?: string | null
  href?: string | null
}

export type FocusNext = {
  id: string
  title: string
  when: string | null
  href?: string | null
  urgent?: boolean
}

export function FocusCard({
  eyebrow,
  tone,
  icon,
  main,
  nextUp,
  nextLabel = "Después",
  emptyText,
  href,
  hrefLabel,
  footer,
  delay = 0,
}: {
  eyebrow: string
  tone: FocusTone
  icon: React.ReactNode
  main: FocusMain | null
  nextUp?: FocusNext[]
  nextLabel?: string
  emptyText: string
  href?: string
  hrefLabel?: string
  footer?: React.ReactNode
  delay?: number
}) {
  const t = TONOS[tone]

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
        "transition-colors duration-200",
        t.borde,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              t.halo,
              t.texto,
            )}
          >
            {icon}
          </span>
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        </div>
        {href && (
          <Link
            href={href}
            prefetch={false}
            className="shrink-0 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            {hrefLabel ?? "Ver todo"}
          </Link>
        )}
      </header>

      {/* Lo próximo, en grande. */}
      <div className="px-5 pb-4 pt-3">
        {main ? (
          <MainBlock main={main} tone={t} />
        ) : (
          <div className="flex items-center gap-2 py-3">
            <span className={cn("h-1.5 w-1.5 rounded-full", t.punto, "opacity-40")} />
            <p className="text-[13px] text-muted-foreground">{emptyText}</p>
          </div>
        )}
      </div>

      {/* Lo que viene después, en chico. */}
      {nextUp && nextUp.length > 0 && (
        <div className="mt-auto border-t border-border/60 px-5 py-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {nextLabel}
          </p>
          <ul className="space-y-1">
            {nextUp.map((n) => {
              const fila = (
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[12.5px] text-foreground/85">
                    {n.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[11.5px] tabular-nums",
                      n.urgent
                        ? "font-medium text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {n.when ?? "—"}
                  </span>
                </span>
              )
              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      prefetch={false}
                      className="block rounded-md px-1 py-0.5 -mx-1 hover:bg-muted/50"
                    >
                      {fila}
                    </Link>
                  ) : (
                    <span className="block px-1 py-0.5">{fila}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {footer && (
        <div className="border-t border-border/60 px-5 py-3">{footer}</div>
      )}
    </motion.section>
  )
}

function MainBlock({
  main,
  tone,
}: {
  main: FocusMain
  tone: (typeof TONOS)[FocusTone]
}) {
  const cuerpo = (
    <>
      <p className="truncate text-[19px] font-semibold leading-tight tracking-tight text-foreground">
        {main.title}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {main.badge && (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
              main.urgent
                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                : cn(tone.halo, tone.texto),
            )}
          >
            {main.badge}
          </span>
        )}
        {main.when && (
          <span className="text-[12.5px] text-muted-foreground">{main.when}</span>
        )}
      </div>
      {main.detail && (
        <p className="mt-1.5 truncate text-[12px] text-muted-foreground">
          {main.detail}
        </p>
      )}
    </>
  )

  return main.href ? (
    <Link
      href={main.href}
      prefetch={false}
      className="block rounded-lg -mx-1 px-1 py-0.5 transition-colors hover:bg-muted/40"
    >
      {cuerpo}
    </Link>
  ) : (
    <div>{cuerpo}</div>
  )
}
