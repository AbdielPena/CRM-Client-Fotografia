/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
    ],
  },
  experimental: {
    // Permite el uso de instrumentation.ts para validación de env al arranque
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: "10mb", // incrementado para galerías con múltiples archivos
    },
  },
}

export default nextConfig
