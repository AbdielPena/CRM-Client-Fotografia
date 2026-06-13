"use client"

import { useEffect } from "react"

/**
 * Registra el service worker en el cliente. Solo en producción para evitar
 * caché agresivo durante desarrollo (next dev sirve assets distintos en cada
 * recarga). El SW se registra en root scope `/`.
 */
export function PWARegister() {
  useEffect(() => {
    const isProd = (globalThis as { process?: { env?: Record<string, string> } })
      .process?.env?.["NODE_ENV"] === "production"
    if (!isProd) return
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Auto-actualización: cuando se publica un SW nuevo (bump de VERSION),
          // recargamos UNA vez en cuanto la versión nueva queda "installed" y ya
          // había un SW controlando (= update real, no la primera instalación).
          // Así el usuario recibe el código nuevo sin tener que limpiar caché.
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing
            if (!installing) return
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                window.location.reload()
              }
            })
          })
        })
        .catch((err) => console.warn("[pwa] SW registration failed", err))
    }

    if (document.readyState === "complete") onLoad()
    else window.addEventListener("load", onLoad, { once: true })
  }, [])

  return null
}
