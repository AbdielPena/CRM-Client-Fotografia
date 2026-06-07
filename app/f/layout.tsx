import type { ReactNode } from "react"

/** Layout luxe para formularios públicos (/f/[token]). */
export default function PublicFormLuxeLayout({ children }: { children: ReactNode }) {
  return <div className="client-luxe min-h-screen bg-background">{children}</div>
}
