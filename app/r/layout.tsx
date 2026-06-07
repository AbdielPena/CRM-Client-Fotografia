import type { ReactNode } from "react"

/** Layout luxe para el registro público de clientes (/r/[slug]). */
export default function PublicRegisterLuxeLayout({ children }: { children: ReactNode }) {
  return <div className="client-luxe min-h-screen bg-background">{children}</div>
}
