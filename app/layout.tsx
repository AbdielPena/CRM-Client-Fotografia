import type { Metadata, Viewport } from "next"
import {
  Inter,
  Instrument_Serif,
  JetBrains_Mono,
  Playfair_Display,
  Cormorant_Garamond,
  Outfit,
} from "next/font/google"
import { Toaster } from "sonner"

import { ThemeProvider, ThemeScript } from "@/components/shared/theme-provider"
import { PWARegister } from "@/components/shared/pwa-register"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
})

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-display",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
})

// ── Fuentes premium para la experiencia del CLIENTE (luxury) ──
// Sólo se usan dentro del scope `.client-luxe`; no afectan el CRM.
const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
  weight: ["400", "500", "600", "700"],
})

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif-soft",
  weight: ["400", "500", "600"],
})

// Sans geométrica "flat" para el portal del cliente (reemplaza el serif).
const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-flat",
  weight: ["300", "400", "500", "600"],
})

export const metadata: Metadata = {
  title: {
    default: "PixelOS",
    template: "%s | PixelOS",
  },
  description: "CRM y Client Gallery para fotógrafos profesionales",
  manifest: "/manifest.webmanifest",
  applicationName: "PixelOS",
  appleWebApp: {
    capable: true,
    title: "PixelOS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFCFD" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0E14" },
  ],
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} ${playfair.variable} ${cormorant.variable} ${outfit.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider defaultTheme="system">
          <PWARegister />
          {children}
          <Toaster
            richColors
            position="top-right"
            closeButton
            toastOptions={{
              classNames: {
                toast:
                  "!rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-lg",
                description: "!text-muted-foreground",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
