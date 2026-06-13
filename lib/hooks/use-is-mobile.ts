"use client"

import * as React from "react"

/**
 * Devuelve true cuando el viewport es < `breakpoint` (default 1024px = `lg`).
 * SSR-safe: arranca en false (asume desktop) y se corrige tras el montaje,
 * de modo que el primer render del cliente coincide con el del servidor.
 */
export function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 0.02}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [breakpoint])

  return isMobile
}
