"use client"

/**
 * StudioFlowOrbit — panel visual del login/register/forgot.
 * Reemplaza los iconos tech del TechOrbitDisplay demo con iconos relevantes a
 * StudioFlow (cámara, calendario, contrato, factura, galería, etc.).
 * Se construye sobre `Ripple` y `TechOrbitDisplay` del módulo
 * modern-animated-sign-in que ya está en el repo.
 */

import * as React from "react"
import {
  Camera,
  CalendarHeart,
  Diamond,
  FileText,
  ImageIcon,
  Sparkles,
  Receipt,
  Heart,
  Star,
} from "lucide-react"
import { Ripple, TechOrbitDisplay } from "@/components/modern-animated-sign-in"
import { cn } from "@/lib/utils/cn"

type OrbitIcon = Parameters<typeof TechOrbitDisplay>[0]["iconsArray"][number]

function bubble(children: React.ReactNode, color: string) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full",
        "bg-white/90 dark:bg-white/[0.08] backdrop-blur-sm",
        "border border-white/60 dark:border-white/10",
        "shadow-md",
      )}
      style={{ color }}
    >
      {children}
    </div>
  )
}

const STUDIOFLOW_ICONS: OrbitIcon[] = [
  // Inner orbit - radius 100
  {
    component: () => bubble(<Camera className="h-4 w-4" />, "#7C3AED"),
    className: "size-10 border-none bg-transparent",
    duration: 22,
    delay: 0,
    radius: 100,
    path: false,
    reverse: false,
  },
  {
    component: () => bubble(<Heart className="h-4 w-4" />, "#D946EF"),
    className: "size-10 border-none bg-transparent",
    duration: 22,
    delay: 12,
    radius: 100,
    path: false,
    reverse: false,
  },

  // Middle orbit - radius 160
  {
    component: () => bubble(<CalendarHeart className="h-5 w-5" />, "#5B5BF7"),
    className: "size-12 border-none bg-transparent",
    duration: 26,
    delay: 4,
    radius: 160,
    path: false,
    reverse: true,
  },
  {
    component: () => bubble(<Diamond className="h-5 w-5" />, "#7C3AED"),
    className: "size-12 border-none bg-transparent",
    duration: 26,
    delay: 15,
    radius: 160,
    path: false,
    reverse: true,
  },
  {
    component: () => bubble(<Sparkles className="h-4 w-4" />, "#D946EF"),
    className: "size-10 border-none bg-transparent",
    duration: 26,
    delay: 22,
    radius: 160,
    path: false,
    reverse: true,
  },

  // Outer orbit - radius 230
  {
    component: () => bubble(<ImageIcon className="h-5 w-5" />, "#7C3AED"),
    className: "size-14 border-none bg-transparent",
    duration: 32,
    delay: 0,
    radius: 230,
    path: false,
    reverse: false,
  },
  {
    component: () => bubble(<FileText className="h-5 w-5" />, "#5B5BF7"),
    className: "size-14 border-none bg-transparent",
    duration: 32,
    delay: 10,
    radius: 230,
    path: false,
    reverse: false,
  },
  {
    component: () => bubble(<Receipt className="h-5 w-5" />, "#7C3AED"),
    className: "size-14 border-none bg-transparent",
    duration: 32,
    delay: 20,
    radius: 230,
    path: false,
    reverse: false,
  },

  // Outermost - radius 300
  {
    component: () => bubble(<Star className="h-4 w-4" />, "#D946EF"),
    className: "size-12 border-none bg-transparent",
    duration: 40,
    delay: 6,
    radius: 300,
    path: false,
    reverse: true,
  },
  {
    component: () => bubble(<Camera className="h-5 w-5" />, "#5B5BF7"),
    className: "size-14 border-none bg-transparent",
    duration: 40,
    delay: 18,
    radius: 300,
    path: false,
    reverse: true,
  },
]

export function StudioFlowOrbit() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Aurora radial background */}
      <div
        aria-hidden
        className="absolute inset-0 bg-aurora-radial opacity-70 dark:opacity-40"
      />
      {/* Subtle grid */}
      <div
        aria-hidden
        className="absolute inset-0 [background-image:linear-gradient(to_right,hsl(var(--border)/0.4)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.4)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />

      {/* Ripple core */}
      <Ripple mainCircleSize={110} numCircles={6} />

      {/* Orbiting product icons */}
      <TechOrbitDisplay iconsArray={STUDIOFLOW_ICONS} />

      {/* Centered brand mark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-aurora shadow-glow-lg">
          <span className="font-display text-h2 leading-none text-white tracking-tight">
            S
          </span>
          <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/25" />
        </div>
      </div>
    </div>
  )
}
