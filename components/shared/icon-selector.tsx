"use client"

import { useState } from "react"
import {
  Crown,
  Heart,
  Camera,
  Trees,
  PartyPopper,
  GraduationCap,
  Briefcase,
  Users,
  Baby,
  Church,
  Tag,
  Star,
  Gift,
  Sparkles,
  Cake,
  Building2,
  Image as ImageIcon,
  CalendarDays,
  Flower2,
  Music,
  type LucideIcon,
} from "lucide-react"

/** Iconos disponibles para categorías (clave = valor guardado en DB). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  crown: Crown,
  heart: Heart,
  camera: Camera,
  trees: Trees,
  "party-popper": PartyPopper,
  "graduation-cap": GraduationCap,
  briefcase: Briefcase,
  users: Users,
  baby: Baby,
  church: Church,
  cake: Cake,
  star: Star,
  gift: Gift,
  sparkles: Sparkles,
  building: Building2,
  image: ImageIcon,
  calendar: CalendarDays,
  flower: Flower2,
  music: Music,
  tag: Tag,
}

/** Render dinámico del icono de una categoría (con fallback). */
export function CategoryIcon({
  name,
  className,
}: {
  name?: string | null
  className?: string
}) {
  const Icon = CATEGORY_ICONS[name ?? "tag"] ?? Tag
  return <Icon className={className} />
}

/** Selector visual de icono — escribe el valor en un input hidden (FormData). */
export function IconSelector({ value, name = "icon" }: { value?: string; name?: string }) {
  const [selected, setSelected] = useState(value && CATEGORY_ICONS[value] ? value : "tag")
  return (
    <div>
      <input type="hidden" name={name} value={selected} />
      <div className="grid grid-cols-10 gap-1.5">
        {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelected(key)}
            title={key}
            className={`flex items-center justify-center rounded-lg border p-2 transition-colors ${
              selected === key
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted-foreground hover:border-border-strong"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  )
}
