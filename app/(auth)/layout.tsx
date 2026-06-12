import Link from "next/link"
import { PixelOSOrbit } from "@/components/auth/studioflow-orbit"
import { ThemeDock } from "@/components/shared/theme-dock"

/**
 * Shared layout for login, register, setup (and future forgot-password).
 * Desktop: split panel (orbit left / form right).
 * Mobile: form fills screen, brand header collapsed at top.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="relative min-h-screen bg-background">
      {/* Theme toggle (top-right floating) */}
      <div className="pointer-events-auto absolute right-4 top-4 z-20 lg:right-6 lg:top-6">
        <ThemeDock variant="compact" />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* =============== Left: visual / orbit =============== */}
        <aside
          aria-hidden
          className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col"
        >
          <div className="absolute inset-0">
            <PixelOSOrbit />
          </div>

          {/* Bottom copy block */}
          <div className="relative z-10 mt-auto flex flex-col gap-2 p-10 text-left">
            <p className="text-caption font-medium uppercase tracking-[0.18em] text-brand">
              PixelOS
            </p>
            <h2 className="max-w-md font-display text-display-lg leading-[1.05] text-foreground">
              El CRM que piensa como un fotógrafo.
            </h2>
            <p className="max-w-sm text-body text-muted-foreground">
              Solicitudes, contratos, pagos y galerías — todo en un solo lugar,
              con el estilo de un estudio premium.
            </p>
          </div>
        </aside>

        {/* =============== Right: form panel =============== */}
        <section className="relative flex flex-col">
          {/* Mobile brand header */}
          <header className="flex items-center justify-center py-8 lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5"
              aria-label="PixelOS"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-aurora shadow-glow">
                <span className="font-display text-h3 text-white leading-none">S</span>
              </div>
              <span className="text-h4 font-semibold text-foreground tracking-tight">
                PixelOS
              </span>
            </Link>
          </header>

          <div className="flex flex-1 items-center justify-center px-6 py-8 lg:py-12">
            <div className="w-full max-w-md">{children}</div>
          </div>

          {/* Footer */}
          <footer className="border-t border-border/60 px-6 py-4">
            <p className="text-center text-caption text-muted-foreground">
              © {new Date().getFullYear()} PixelOS · Hecho en RD para
              fotógrafos profesionales
            </p>
          </footer>
        </section>
      </div>
    </main>
  )
}
