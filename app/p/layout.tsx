import type { ReactNode } from "react"

/**
 * Layout de la experiencia de RESERVA del cliente.
 * Aplica el tema premium `.client-luxe` (blanco/crema/dorado + serif editorial)
 * a todas las rutas /p/** sin afectar el CRM del fotógrafo.
 */
export default function BookingLuxeLayout({ children }: { children: ReactNode }) {
  return <div className="client-luxe min-h-screen">{children}</div>
}
