import type { ReactNode } from "react"

/**
 * Layout del WIZARD de confirmación de reserva (/b/[token]).
 * Aplica el tema premium `.client-luxe` (blanco/crema/dorado + serif) sin
 * afectar el CRM.
 */
export default function BookingFlowLuxeLayout({
  children,
}: {
  children: ReactNode
}) {
  return <div className="client-luxe min-h-screen">{children}</div>
}
