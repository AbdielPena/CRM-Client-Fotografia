"use client"

/**
 * ThemeProvider — custom, cero dependencias externas.
 *
 * Maneja tres modos: "light" | "dark" | "system".
 * - Persiste elección en localStorage bajo la key "studioflow-theme".
 * - Aplica la clase `dark` en <html> según preferencia.
 * - Escucha cambios en prefers-color-scheme para el modo "system".
 * - Anti-flash: el script inline en <head> (ThemeScript) aplica el tema
 *   ANTES de que React hidrate, evitando el "flash of wrong theme".
 * - Soporta View Transitions API para la animación circular del toggle.
 */

import * as React from "react"

export type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme, origin?: { x: number; y: number }) => void
  toggle: (origin?: { x: number; y: number }) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = "studioflow-theme"

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

// Rutas públicas de cliente (formularios, reserva, firma, factura, feedback,
// registro): SIEMPRE en claro. Un visitante con el celular en modo oscuro NO
// debe ver el formulario negro. NO incluye /g (galería, tiene su propio tema)
// ni el CRM (respeta la preferencia del fotógrafo).
const FORCE_LIGHT_RE = /^\/(f|r|fb|sign|p|b|booking|i)(\/|$)/

function isForcedLightPath(): boolean {
  return typeof window !== "undefined" && FORCE_LIGHT_RE.test(window.location.pathname)
}

function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement
  const eff: ResolvedTheme = isForcedLightPath() ? "light" : resolved
  if (eff === "dark") {
    root.classList.add("dark")
    root.style.colorScheme = "dark"
  } else {
    root.classList.remove("dark")
    root.style.colorScheme = "light"
  }
}

/**
 * Inline script — debe inyectarse en el <head> antes del cuerpo para evitar flash.
 * Lee localStorage, resuelve "system", aplica clase `dark` si corresponde.
 */
export const themeScript = `
(function() {
  try {
    var forceLight = /^\\/(f|r|fb|sign|p|b|booking|i)(\\/|$)/.test(location.pathname);
    var stored = localStorage.getItem('${STORAGE_KEY}') || 'system';
    var resolved = stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : stored;
    if (!forceLight && resolved === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  } catch (e) {}
})();
`

export function ThemeScript() {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: themeScript }}
    />
  )
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: {
  children: React.ReactNode
  defaultTheme?: Theme
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>("light")
  const [mounted, setMounted] = React.useState(false)

  // Hydrate from localStorage
  React.useEffect(() => {
    try {
      const stored = (localStorage.getItem(STORAGE_KEY) as Theme) || defaultTheme
      setThemeState(stored)
      setResolvedTheme(stored === "system" ? getSystemTheme() : stored)
    } catch {
      // ignore
    }
    setMounted(true)
  }, [defaultTheme])

  // Listen to system preference changes when in "system" mode
  React.useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      const sys = mq.matches ? "dark" : "light"
      setResolvedTheme(sys)
      applyThemeClass(sys)
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  // Apply resolved whenever it changes
  React.useEffect(() => {
    if (mounted) applyThemeClass(resolvedTheme)
  }, [resolvedTheme, mounted])

  const setTheme = React.useCallback(
    (next: Theme, origin?: { x: number; y: number }) => {
      const newResolved = next === "system" ? getSystemTheme() : next

      // View Transitions API: animate the theme swap as an expanding circle
      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => { ready: Promise<void> }
      }

      const performSwap = () => {
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // ignore
        }
        setThemeState(next)
        setResolvedTheme(newResolved)
      }

      if (typeof doc.startViewTransition === "function" && origin) {
        const transition = doc.startViewTransition(performSwap)
        transition.ready
          .then(() => {
            const endRadius = Math.hypot(
              Math.max(origin.x, window.innerWidth - origin.x),
              Math.max(origin.y, window.innerHeight - origin.y),
            )
            document.documentElement.animate(
              {
                clipPath: [
                  `circle(0px at ${origin.x}px ${origin.y}px)`,
                  `circle(${endRadius}px at ${origin.x}px ${origin.y}px)`,
                ],
              },
              {
                duration: 420,
                easing: "cubic-bezier(.32,.72,0,1)",
                pseudoElement: "::view-transition-new(root)",
              },
            )
          })
          .catch(() => {})
      } else {
        performSwap()
      }
    },
    [],
  )

  const toggle = React.useCallback(
    (origin?: { x: number; y: number }) => {
      setTheme(resolvedTheme === "dark" ? "light" : "dark", origin)
    },
    [resolvedTheme, setTheme],
  )

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggle }),
    [theme, resolvedTheme, setTheme, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>")
  }
  return ctx
}
