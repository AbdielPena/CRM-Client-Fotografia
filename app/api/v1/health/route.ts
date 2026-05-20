import { apiV1Json } from "@/lib/api-v1-auth"

/**
 * Health check público — sin auth.
 */
export function GET() {
  return apiV1Json({
    status: "ok",
    api_version: "v1",
    timestamp: new Date().toISOString(),
  })
}
