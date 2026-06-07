import type { ReactNode } from "react"

/** Layout luxe para la firma pública de contratos (/sign/[token]). */
export default function ContractSignLuxeLayout({ children }: { children: ReactNode }) {
  return <div className="client-luxe min-h-screen bg-background">{children}</div>
}
