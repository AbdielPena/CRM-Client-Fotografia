import Link from "next/link"
import { ShieldCheck, Workflow, BarChart3, Sparkles } from "lucide-react"

import { ThemeDock } from "@/components/shared/theme-dock"

/**
 * Shared layout for login, register, setup, forgot-password.
 * Rediseño minimalista (flat / blanco): split inmersivo —
 * izquierda marca + valor del producto, derecha el formulario.
 * Mobile: header de marca arriba, el form ocupa la pantalla.
 */
const FEATURES = [
  {
    icon: ShieldCheck,
    tint: "bg-[#E6EEFB] text-[#5b6b8c]",
    title: "Un solo acceso",
    body: "Entra una vez y maneja CRM, finanzas, inventario y facturación desde un mismo lugar.",
  },
  {
    icon: Workflow,
    tint: "bg-[#E8F5EE] text-[#3f8c64]",
    title: "Todo conectado",
    body: "Tus clientes, pagos y entregas fluyen entre módulos en tiempo real, sin duplicar.",
  },
  {
    icon: BarChart3,
    tint: "bg-[#EFEAF8] text-[#7d6bb0]",
    title: "Decisiones con datos",
    body: "Métricas claras y minimalistas para ver cómo va tu estudio de un vistazo.",
  },
  {
    icon: Sparkles,
    tint: "bg-[#FBEAF1] text-[#b06487]",
    title: "Tu marca, en todo",
    body: "Sube tu logo una vez y se aplica a cada módulo automáticamente.",
  },
]

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="relative min-h-screen bg-background font-sans">
      <div className="pointer-events-auto absolute right-4 top-4 z-20 lg:right-6 lg:top-6">
        <ThemeDock variant="compact" />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* =============== Left: marca + valor =============== */}
        <aside className="relative hidden flex-col justify-center border-r border-border bg-muted/20 px-12 py-16 lg:flex xl:px-16">
          <Link
            href="/"
            className="mb-12 inline-flex items-center"
            aria-label="Abby Pixel"
          >
            <span
              className="brand-logo text-foreground"
              role="img"
              aria-label="Abby Pixel"
              style={{ height: 30, width: 140 }}
            />
          </Link>

          <div className="flex max-w-md flex-col gap-7">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-[10px] ${f.tint}`}
                >
                  <f.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
                <div>
                  <h3 className="text-[14.5px] font-semibold leading-tight text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* =============== Right: formulario =============== */}
        <section className="relative flex flex-col">
          <header className="flex items-center justify-center py-8 lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center"
              aria-label="Abby Pixel"
            >
              <span
                className="brand-logo text-foreground"
                role="img"
                aria-label="Abby Pixel"
                style={{ height: 26, width: 122 }}
              />
            </Link>
          </header>

          <div className="flex flex-1 items-center justify-center px-6 py-8 lg:py-12">
            <div className="w-full max-w-[400px]">{children}</div>
          </div>

          <footer className="px-6 py-5">
            <p className="text-center text-[11.5px] text-muted-foreground/70">
              © {new Date().getFullYear()} Abby Pixel · Hecho en RD para fotógrafos
              profesionales
            </p>
          </footer>
        </section>
      </div>
    </main>
  )
}
