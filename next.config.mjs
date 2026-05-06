/** @type {import('next').NextConfig} */
// build: production deploy via GitHub Actions (FTP + atomic staging swap, full sync)
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
    ],
  },
  poweredByHeader: false, // ocultar X-Powered-By: Next.js
  compress: true, // gzip de respuestas (cPanel también puede manejarlo)
  productionBrowserSourceMaps: false, // no exponer sourcemaps en prod
  // En shared hosting (BanaHosting/cPanel) el límite de threads es bajo —
  // forzamos build single-thread para evitar "Resource temporarily unavailable"
  // de rayon-core al inicializar su thread pool.
  swcMinify: false, // Terser puro JS en vez de SWC nativo (no necesita rayon)
  experimental: {
    // Permite el uso de instrumentation.ts para validación de env al arranque
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: "10mb", // incrementado para galerías con múltiples archivos
    },
    workerThreads: false,
    cpus: 1,
  },
  async headers() {
    // Headers de seguridad globales — aplican a todas las rutas excepto print/portal públicos
    return [
      {
        source: "/:path*",
        headers: [
          // Anti-clickjacking
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // MIME-sniffing protection
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer mínimo
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No habilitar features peligrosas por default
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // HSTS — forzar HTTPS por 6 meses (después de validar prod, subir a 1 año)
          {
            key: "Strict-Transport-Security",
            value: "max-age=15768000; includeSubDomains",
          },
        ],
      },
      {
        // Permite que las galerías públicas y prints sean embebibles si el studio quiere
        // (ej: mostrar la galería embebida en su sitio principal)
        source: "/g/:token*",
        headers: [{ key: "X-Frame-Options", value: "ALLOWALL" }],
      },
      {
        source: "/contract-print/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/invoice-print/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Cachear assets estáticos (Next ya hace esto pero lo reforzamos)
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Cachear thumbnails de galería (si STORAGE_DRIVER=local)
        source: "/dev-uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
    ]
  },
}

export default nextConfig
