"use client"

import * as React from "react"

export const SIDEBAR_COOKIE_NAME = "sf-sidebar-collapsed"
export const SIDEBAR_WIDTH_EXPANDED = 256
export const SIDEBAR_WIDTH_COLLAPSED = 72

interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (v: boolean) => void
  /** Estado del drawer móvil (off-canvas). En desktop es irrelevante. */
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  toggleMobile: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

interface SidebarProviderProps {
  initialCollapsed?: boolean
  children: React.ReactNode
}

export function SidebarProvider({
  initialCollapsed = false,
  children,
}: SidebarProviderProps) {
  const [collapsed, setCollapsedState] = React.useState(initialCollapsed)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const setCollapsed = React.useCallback((v: boolean) => {
    setCollapsedState(v)
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${v ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }, [])

  const toggle = React.useCallback(() => {
    setCollapsed(!collapsed)
  }, [collapsed, setCollapsed])

  const toggleMobile = React.useCallback(() => {
    setMobileOpen((v) => !v)
  }, [])

  // Atajo de teclado: Cmd/Ctrl + B
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])

  const value = React.useMemo(
    () => ({ collapsed, toggle, setCollapsed, mobileOpen, setMobileOpen, toggleMobile }),
    [collapsed, toggle, setCollapsed, mobileOpen, toggleMobile],
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) {
    throw new Error("useSidebar debe usarse dentro de SidebarProvider")
  }
  return ctx
}

/**
 * Variante que NO lanza si está fuera del provider — devuelve null.
 * Útil en componentes compartidos (ej. AppTopbar) que también se montan
 * en árboles sin SidebarProvider (grupo `(platform)`).
 */
export function useSidebarOptional() {
  return React.useContext(SidebarContext)
}
