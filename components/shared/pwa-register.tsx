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
        .catch((err) => console.warn("[pwa] SW registration failed", err))
    }

    if (document.readyState === "complete") onLoad()
    else window.addEventListener("load", onLoad, { once: true })
  }, [])

  return null
}
