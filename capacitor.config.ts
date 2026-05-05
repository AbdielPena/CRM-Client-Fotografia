import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Configuración de StudioFlow para iOS / Android.
 *
 * Estrategia: thin wrapper sobre la app web (server.url) en vez de
 * empaquetar un build estático. Esto se debe a que StudioFlow usa
 * Server Actions, Server Components y RLS de Supabase — todas
 * features que requieren un servidor Node corriendo.
 *
 * El SDK móvil entonces es: WebView + acceso a APIs nativas
 * (notificaciones push, cámara, almacenamiento offline, status bar, etc.).
 */
const config: CapacitorConfig = {
  appId: "com.studioflow.app",
  appName: "StudioFlow",
  webDir: "public", // se usa cuando server.url no está definido (fallback)

  server: {
    // Apunta al SaaS en producción. Para dev local, sobrescribir con
    // CAPACITOR_SERVER_URL=http://192.168.x.x:3000 antes de `cap sync`.
    url: process.env["CAPACITOR_SERVER_URL"] ?? "https://app.studioflow.do",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
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
