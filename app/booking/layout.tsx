import type { ReactNode } from "react"

/**
 * Layout de los links públicos por CATEGORÍA (/booking/[categoria]).
 * Mismo tema premium `.client-luxe` que la experiencia de reserva /p/**.
 */
export default function BookingCategoryLayout({ children }: { children: ReactNode }) {
  return <div className="client-luxe min-h-screen">{children}</div>
}
