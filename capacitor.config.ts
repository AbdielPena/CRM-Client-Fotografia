import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Configuración de la app móvil UNIFICADA (PixelOS) para Android / iOS.
 *
 * Estrategia: thin wrapper sobre la web (server.url) en vez de empaquetar
 * un build estático. El stack es Next SSR + Server Actions + RLS de Supabase
 * → requiere un servidor Node corriendo; no se puede exportar a estático.
 *
 * HOME = el HUB (hub.abbypixel.com), que es el launcher cross-system. Desde
 * ahí el usuario entra a cada sistema (CRM, Finanzas, Inventario, Facturación),
 * todos bajo *.abbypixel.com. `allowNavigation` autoriza esa navegación
 * cross-subdominio dentro de la misma WebView (el SSO usa cookies de dominio
 * .abbypixel.com, así que la sesión se comparte entre subdominios).
 *
 * El SDK móvil aporta: WebView + APIs nativas (push, cámara, almacenamiento
 * offline, status bar, etc.).
 */
const config: CapacitorConfig = {
  appId: "com.studioflow.app",
  appName: "PixelOS",
  webDir: "public", // se usa cuando server.url no está definido (fallback)

  server: {
    // HOME unificado = el hub. Para dev local, sobrescribir con
    // CAPACITOR_SERVER_URL=http://192.168.x.x:3000 antes de `cap sync`.
    url: process.env["CAPACITOR_SERVER_URL"] ?? "https://hub.abbypixel.com",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    // Navegación permitida dentro de la WebView: todos los sistemas del ecosistema.
    allowNavigation: [
      "hub.abbypixel.com",
      "my.abbypixel.com",
      "fi.abbypixel.com",
      "inventario.abbypixel.com",
      "facturacion.abbypixel.com",
      "*.abbypixel.com",
    ],
    // Si el server cae, mostrar offline page del PWA cache.
    errorPath: "/offline.html",
  },

  ios: {
    contentInset: "always",
    backgroundColor: "#0D0E14",
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },

  android: {
    backgroundColor: "#0D0E14",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0D0E14",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0D0E14",
      overlaysWebView: false,
    },
  },
}

export default config
