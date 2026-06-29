"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"

/**
 * Mantiene "viva" la pantalla actual sin recargar la página: re-pide los datos
 * del server (router.refresh) cuando la pestaña/ventana vuelve a estar visible
 * y, como respaldo, cada `intervalMs` mientras esté visible. router.refresh()
 * re-ejecuta los server components sin perder el estado del cliente (scroll,
 * formularios). Montado una vez en el layout (studio) → cubre TODO el admin.
 */
export function LiveRefresh({
  intervalMs = 30000,
}: {
  intervalMs?: number
}): null {
  const router = useRouter()
  const pathname = usePathname()
  const lastRef = useRef(0)

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      const now = Date.now()
      // Debounce: evita ráfagas (focus + visibilitychange juntos).
      if (now - lastRef.current < 4000) return
      lastRef.current = now
      router.refresh()
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh()
    }

    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisibility)
    const id = window.setInterval(refresh, intervalMs)

    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisibility)
      window.clearInterval(id)
    }
    // Re-instala los listeners al cambiar de ruta (pathname) para que el
    // debounce no bloquee un refresco tras navegar.
  }, [router, intervalMs, pathname])

  return null
}
